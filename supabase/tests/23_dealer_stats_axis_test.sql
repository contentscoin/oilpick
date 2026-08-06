-- pgTAP: [19 T10] v_dealer_rider_stats 귀속 축 고정 (20260806000005).
-- 고정하는 계약: ① 좌상 시점과 admin 시점이 **같은 값**을 준다(RLS 우연 의존 제거)
-- ② 재배정 후 새 좌상은 과거 실적을 물려받지 않는다 ③ 옛 좌상의 정산(usage)은 스냅샷으로 유지
-- ④ 본사 직속(dealer_id null) 라이더의 본사 직속 주문은 실적으로 잡힌다(is not distinct from).
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 픽스처: admin + 좌상A/B + 라이더2(A소속·무소속) + 점주 ──────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('af000000-0000-0000-0000-0000000000ad'::uuid),  -- admin
  ('af000000-0000-0000-0000-00000000000a'::uuid),  -- 좌상A
  ('af000000-0000-0000-0000-00000000000b'::uuid),  -- 좌상B
  ('af000000-0000-0000-0000-000000000101'::uuid),  -- 라이더1(좌상A 소속)
  ('af000000-0000-0000-0000-000000000102'::uuid),  -- 라이더2(본사 직속)
  ('af000000-0000-0000-0000-000000000001'::uuid)   -- 점주
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('af000000-0000-0000-0000-0000000000ad','admin','0','관리자'),
  ('af000000-0000-0000-0000-00000000000a','dealer','0','좌상A'),
  ('af000000-0000-0000-0000-00000000000b','dealer','0','좌상B'),
  ('af000000-0000-0000-0000-000000000101','rider','0','라이더1'),
  ('af000000-0000-0000-0000-000000000102','rider','0','라이더2'),
  ('af000000-0000-0000-0000-000000000001','supplier','0','점주');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('af000000-0000-0000-0000-000000000001','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online, dealer_id, last_location) values
  ('af000000-0000-0000-0000-000000000101','b','01','APPROVED',true,'af000000-0000-0000-0000-00000000000a',
   ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography),
  ('af000000-0000-0000-0000-000000000102','b','02','APPROVED',true,null,
   ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into dealer_accounts (dealer_id, credit_limit) values
  ('af000000-0000-0000-0000-00000000000a', 1000000),
  ('af000000-0000-0000-0000-00000000000b', 1000000);

-- POINT 완료 주문 1건을 만드는 헬퍼(20kg × 700 = 14,000P).
create function _mk_done(p_order uuid, p_rider uuid) returns void language plpgsql as $$
begin
  insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
  values (p_order,'af000000-0000-0000-0000-000000000001','REQUESTED',20,'서울 강서구 화곡로 1',
          ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700);
  perform fn_transition_order(p_order,'ACCEPT',p_rider,'rider');
  perform fn_transition_order(p_order,'ARRIVE',p_rider,'rider');
  perform fn_transition_order(p_order,'SUBMIT_MEASURE',p_rider,'rider',
    '{"measuredKg":20,"photoUrls":["p"],"payoutMethod":"POINT"}'::jsonb);
  perform fn_transition_order(p_order,'CONFIRM_MEASURE','af000000-0000-0000-0000-000000000001','supplier');
end $$;

select _mk_done('af000000-0000-0000-0000-000000000201','af000000-0000-0000-0000-000000000101'); -- 라이더1 @좌상A
select _mk_done('af000000-0000-0000-0000-000000000202','af000000-0000-0000-0000-000000000102'); -- 라이더2 @본사 직속

-- ── ① 재배정 전: 좌상A 시점 = admin 시점 (같은 값) ──────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select point_paid::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000101'),
          14000, '좌상A 시점: 소속 라이더 실적 14,000P');
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is((select point_paid::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000101'),
          14000, 'admin 시점: 같은 값 14,000P(보는 사람에 따라 달라지지 않는다)');
reset role; reset request.jwt.claims;

-- ── ② 본사 직속 라이더: dealer_id null끼리 매칭돼 실적이 잡힌다(is not distinct from) ──
set local role authenticated;
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is((select point_paid::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000102'),
          14000, '본사 직속 라이더: 본사 직속 주문이 실적으로 잡힌다(= 였다면 0으로 증발)');
reset role; reset request.jwt.claims;

-- ── ③ 라이더1을 좌상B로 재배정 ─────────────────────────────────────────────
update rider_profiles set dealer_id='af000000-0000-0000-0000-00000000000b'
 where id='af000000-0000-0000-0000-000000000101';

set local role authenticated;
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select point_paid::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000101'),
          0, '좌상B: 재배정 전 실적을 물려받지 않는다');
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is((select point_paid::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000101'),
          0, 'admin 시점도 0 — 좌상B 시점과 일치(수정 전엔 14,000이 잡혔다)');
select is((select completed_count::int from v_dealer_rider_stats where rider_id='af000000-0000-0000-0000-000000000101'),
          0, 'admin 시점 완료 건수도 0(전 생애 집계 아님)');
reset role; reset request.jwt.claims;

-- ── ④ 옛 좌상A: 정산(usage)은 스냅샷이라 그대로 남는다 ─────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"af000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select usage::int from v_dealer_statement), 14000,
  '좌상A: 라이더가 떠나도 정산 usage는 스냅샷으로 유지(14,000P)');
select is((select count(*)::int from v_dealer_rider_stats), 0,
  '좌상A: 소속 라이더가 없어 실적 행도 0 — 정산과의 차액은 화면이 "전 소속 귀속분"으로 표기(19 §5)');
-- 좌상 축 총 완료 건수(v_dealer_settlement_orders)는 그대로 1건 → 화면 대사의 기준.
select is((select count(*)::int from v_dealer_settlement_orders), 1,
  '좌상A: 좌상 축 완료 주문 1건(대사 기준은 스냅샷 축)');
reset role; reset request.jwt.claims;

drop function _mk_done(uuid, uuid);
select * from finish();
rollback;
