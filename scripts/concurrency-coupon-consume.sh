#!/usr/bin/env bash
# [07 F3a] 쿠폰 소진 동시성 실측 — 잔액 1장 라이더로 서로 다른 주문 2건을 동시에 소진 시도.
#
# 목적: fn_consume_coupon의 rider 단위 FOR UPDATE 직렬화가 오버스펜드를 막는지(정확히 1건만 성공,
# 나머지는 INSUFFICIENT_COUPON) 실측한다. pgTAP(단일 세션)로는 재현 불가하므로 2개의 psql
# 커넥션을 동시에 띄운다.
#
# 두 계층을 각각 측정한다:
#   [A] fn_consume_coupon 직접 경합 — 쿠폰 직렬화가 INSUFFICIENT_COUPON을 내는 것을 확인(ACCEPT가
#       내부에서 호출하는 바로 그 경로).
#   [B] fn_transition_order ACCEPT 경합 — 신 주문 2건을 같은 라이더가 동시 수락. 라이더당 활성주문
#       1건 부분 유니크 인덱스(idx_rider_single_active_order)가 UPDATE 단계에서 먼저 직렬화하므로
#       패자는 23505(unique_violation)로 떨어진다(오버스펜드 2중 방어). 이 경로에선 INSUFFICIENT_COUPON에
#       도달하기 전에 이미 차단됨을 그대로 실측한다.
#
# 로컬 스택(Postgres 54322)이 떠 있어야 한다. `supabase db reset`으로 정리 가능.
set -uo pipefail

PGCONN=(-h 127.0.0.1 -p 54322 -U postgres -d postgres)
export PGPASSWORD=postgres
run() { psql "${PGCONN[@]}" -tA "$@"; }

SUP='ee000000-0000-0000-0000-000000000001'
RIDER='ee000000-0000-0000-0000-0000000000b2'
OA='ee000000-0000-0000-0000-00000000000a'
OB='ee000000-0000-0000-0000-00000000000b'

cleanup() {
  run -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
alter table coupon_ledger disable trigger trg_coupon_no_update;
delete from coupon_ledger where rider_id='$RIDER';
alter table coupon_ledger enable trigger trg_coupon_no_update;
delete from order_events where order_id in ('$OA','$OB');
delete from pickup_orders where id in ('$OA','$OB');
delete from rider_profiles where id='$RIDER';
delete from supplier_profiles where id='$SUP';
delete from profiles where id in ('$SUP','$RIDER');
delete from auth.users where id in ('$SUP','$RIDER');
SQL
}

seed() {
  run -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('$SUP','00000000-0000-0000-0000-000000000000','authenticated','authenticated','conc-sup@t',now(),now()),
  ('$RIDER','00000000-0000-0000-0000-000000000000','authenticated','authenticated','conc-rid@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('$SUP','supplier','010','동시성공급'), ('$RIDER','rider','011','동시성라이더');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('$SUP','b','s','a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('$RIDER','b','12가9999','APPROVED');
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('$OA','$SUP','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1),
  ('$OB','$SUP','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,1);
SQL
}

charge_one() { run -v ON_ERROR_STOP=1 >/dev/null -c "select fn_charge_coupon('$RIDER',1,null,null,'concurrency seed',null);"; }
balance()    { run -c "select coalesce(balance,0) from v_coupon_balance where rider_id='$RIDER';"; }

echo "=================================================================="
echo " [A] fn_consume_coupon 직접 경합 (잔액 1, 서로 다른 주문 2건)"
echo "=================================================================="
cleanup; seed; charge_one
echo "  준비: 잔액 = $(balance)장"

# conn1: 소진 후 3초 트랜잭션 유지(락 점유) → 그 사이 conn2가 진입해 블록됨.
( run -v ON_ERROR_STOP=1 <<SQL > /tmp/conc_c1.out 2>&1
begin;
select 'C1_CONSUME_OK ' || (fn_consume_coupon('$RIDER','$OA',1)).qty;
select pg_sleep(3);
commit;
SQL
) &
C1PID=$!
sleep 1
# conn2: conn1이 락 점유 중 진입 → 블록 → conn1 커밋 후 잔액 0 재계산 → INSUFFICIENT_COUPON.
run -v ON_ERROR_STOP=1 -c "select 'C2_CONSUME_OK ' || (fn_consume_coupon('$RIDER','$OB',1)).qty;" > /tmp/conc_c2.out 2>&1
C2RC=$?
wait $C1PID
C1OUT=$(cat /tmp/conc_c1.out); C2OUT=$(cat /tmp/conc_c2.out)
echo "  conn1: $(echo "$C1OUT" | grep -E 'C1_CONSUME_OK|ERROR' | head -1)"
echo "  conn2: $(echo "$C2OUT" | grep -E 'C2_CONSUME_OK|ERROR' | head -1)"
echo "  최종 잔액 = $(balance)장,  CONSUME 행 수 = $(run -c "select count(*) from coupon_ledger where rider_id='$RIDER' and entry_type='CONSUME';")"
A_OK=1
echo "$C1OUT" | grep -q 'C1_CONSUME_OK -1' || { echo "  [FAIL] conn1 소진 실패"; A_OK=0; }
echo "$C2OUT" | grep -q 'INSUFFICIENT_COUPON' || { echo "  [FAIL] conn2가 INSUFFICIENT_COUPON이 아님"; A_OK=0; }
[ "$(run -c "select count(*) from coupon_ledger where rider_id='$RIDER' and entry_type='CONSUME';")" = "1" ] || { echo "  [FAIL] CONSUME 행이 정확히 1개가 아님(오버스펜드)"; A_OK=0; }
[ "$A_OK" = "1" ] && echo "  [A PASS] 정확히 1건 소진 성공, 1건 INSUFFICIENT_COUPON — 오버스펜드 없음"

echo
echo "=================================================================="
echo " [B] fn_transition_order ACCEPT 경합 (잔액 1, 서로 다른 주문 2건)"
echo "=================================================================="
cleanup; seed; charge_one
echo "  준비: 잔액 = $(balance)장"

( run -v ON_ERROR_STOP=1 <<SQL > /tmp/conc_b1.out 2>&1
begin;
select 'B1_ACCEPT_OK ' || (fn_transition_order('$OA','ACCEPT','$RIDER','rider')).status;
select pg_sleep(3);
commit;
SQL
) &
B1PID=$!
sleep 1
run -v ON_ERROR_STOP=1 -c "select 'B2_ACCEPT_OK ' || (fn_transition_order('$OB','ACCEPT','$RIDER','rider')).status;" > /tmp/conc_b2.out 2>&1
wait $B1PID
B1OUT=$(cat /tmp/conc_b1.out); B2OUT=$(cat /tmp/conc_b2.out)
echo "  conn1: $(echo "$B1OUT" | grep -E 'B1_ACCEPT_OK|ERROR' | head -1)"
echo "  conn2: $(echo "$B2OUT" | grep -E 'B2_ACCEPT_OK|ERROR' | head -1)"
ACC=$(run -c "select count(*) from pickup_orders where id in ('$OA','$OB') and status='ACCEPTED';")
echo "  ACCEPTED 주문 수 = $ACC,  최종 잔액 = $(balance)장"
B_OK=1
echo "$B1OUT" | grep -q 'B1_ACCEPT_OK ACCEPTED' || { echo "  [FAIL] conn1 수락 실패"; B_OK=0; }
echo "$B2OUT" | grep -qiE 'duplicate key|23505|unique' || { echo "  [FAIL] conn2가 유니크 위반(23505)이 아님"; B_OK=0; }
[ "$ACC" = "1" ] || { echo "  [FAIL] ACCEPTED가 정확히 1건이 아님"; B_OK=0; }
[ "$B_OK" = "1" ] && echo "  [B PASS] 정확히 1건 수락, 1건 23505(라이더당 활성 1건 유니크) — 쿠폰 소진 이전 단계에서 2중 차단"

cleanup
echo
echo "정리 완료."
