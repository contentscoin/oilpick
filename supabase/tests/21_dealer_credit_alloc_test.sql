-- pgTAP: [18 R2] 좌상 크레딧 공유·배분 — POOL 회귀 / PER_RIDER 개인 한도 게이트 / 총량 우선 /
-- 정산 청구 후 회복 / v_rider_credit 계산 / 라이더 셀프 credit_limit 변조 차단.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- ── 픽스처: 좌상 2(POOL/PER_RIDER) + 라이더 3 + 점주 ──────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('ca000000-0000-0000-0000-000000000001'::uuid),('ca000000-0000-0000-0000-000000000002'::uuid),
  ('ca000000-0000-0000-0000-000000000101'::uuid),('ca000000-0000-0000-0000-000000000102'::uuid),
  ('ca000000-0000-0000-0000-000000000103'::uuid),('ca000000-0000-0000-0000-000000000201'::uuid)
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('ca000000-0000-0000-0000-000000000001','dealer','0','풀좌상'),
  ('ca000000-0000-0000-0000-000000000002','dealer','0','배분좌상'),
  ('ca000000-0000-0000-0000-000000000101','rider','0','풀라이더'),
  ('ca000000-0000-0000-0000-000000000102','rider','0','배분라이더A'),
  ('ca000000-0000-0000-0000-000000000103','rider','0','배분라이더B'),
  ('ca000000-0000-0000-0000-000000000201','supplier','0','점주');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('ca000000-0000-0000-0000-000000000201','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
-- A는 5,000P 배분, B는 미배분(null) — PER_RIDER에서 null=0 취급 검증용.
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, dealer_id, credit_limit) values
  ('ca000000-0000-0000-0000-000000000101','b','01','APPROVED','ca000000-0000-0000-0000-000000000001',null),
  ('ca000000-0000-0000-0000-000000000102','b','02','APPROVED','ca000000-0000-0000-0000-000000000002',5000),
  ('ca000000-0000-0000-0000-000000000103','b','03','APPROVED','ca000000-0000-0000-0000-000000000002',null)
  on conflict (id) do nothing;
insert into dealer_accounts (dealer_id, deposit_amount, credit_limit, claim_threshold, fee_rate_bp, allocation_mode) values
  ('ca000000-0000-0000-0000-000000000001', 0, 100000, 5000000, 0, 'POOL'),
  ('ca000000-0000-0000-0000-000000000002', 0, 100000, 5000000, 0, 'PER_RIDER');

-- 헬퍼: ARRIVED 주문 생성 후 POINT 계량 제출까지.
create or replace function _mk_point_order(p_id uuid, p_rider uuid, p_dealer uuid, p_kg numeric)
returns void language plpgsql as $$
begin
  insert into pickup_orders (id, supplier_id, rider_id, dealer_id, status, requested_kg,
    pickup_address, pickup_location, snapshot_price_per_kg)
  values (p_id,'ca000000-0000-0000-0000-000000000201',p_rider,p_dealer,'ARRIVED',p_kg,'a',
    ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography, 1000);
  perform fn_transition_order(p_id,'SUBMIT_MEASURE',p_rider,'rider',
    ('{"measuredKg":'||p_kg||',"photoUrls":["https://x/p.jpg"],"payoutMethod":"POINT"}')::jsonb);
end $$;

-- ============ (1) POOL 모드 회귀 — 기존 동작 그대로 ============
select _mk_point_order('ca000000-0000-0000-0000-000000000401','ca000000-0000-0000-0000-000000000101','ca000000-0000-0000-0000-000000000001', 6.0);
select lives_ok(
  $q$select fn_transition_order('ca000000-0000-0000-0000-000000000401','CONFIRM_MEASURE','ca000000-0000-0000-0000-000000000201','supplier')$q$,
  'POOL: 라이더 credit_limit이 null이어도 좌상 총량 내면 통과(기존 동작 무변경)');
select is((select status from pickup_orders where id='ca000000-0000-0000-0000-000000000401'), 'COMPLETED',
  'POOL: 완료 처리됨');
select is((select amount from point_ledger where order_id='ca000000-0000-0000-0000-000000000401' and entry_type='EARN'), 6000,
  'POOL: EARN 6,000P 발행');

-- ============ (2) PER_RIDER — 배분 한도 내 통과 ============
select _mk_point_order('ca000000-0000-0000-0000-000000000402','ca000000-0000-0000-0000-000000000102','ca000000-0000-0000-0000-000000000002', 4.0);
select lives_ok(
  $q$select fn_transition_order('ca000000-0000-0000-0000-000000000402','CONFIRM_MEASURE','ca000000-0000-0000-0000-000000000201','supplier')$q$,
  'PER_RIDER: 개인 한도 5,000 내 4,000 지급 통과');

-- ============ (3) PER_RIDER — 개인 한도 초과 거부(좌상 총량은 여유) ============
-- A 누적 4,000 + 이번 2,000 = 6,000 > 개인한도 5,000. 좌상 총량 100,000은 여유 → 개인 게이트가 잡아야 한다.
select _mk_point_order('ca000000-0000-0000-0000-000000000403','ca000000-0000-0000-0000-000000000102','ca000000-0000-0000-0000-000000000002', 2.0);
select throws_ok(
  $q$select fn_transition_order('ca000000-0000-0000-0000-000000000403','CONFIRM_MEASURE','ca000000-0000-0000-0000-000000000201','supplier')$q$,
  'RIDER_LIMIT_EXCEEDED',
  'PER_RIDER: 개인 한도 초과는 좌상 총량이 남아 있어도 거부');

-- ============ (4) PER_RIDER — 미배분(null=0) 라이더 전량 거부 ============
select _mk_point_order('ca000000-0000-0000-0000-000000000404','ca000000-0000-0000-0000-000000000103','ca000000-0000-0000-0000-000000000002', 1.0);
select throws_ok(
  $q$select fn_transition_order('ca000000-0000-0000-0000-000000000404','CONFIRM_MEASURE','ca000000-0000-0000-0000-000000000201','supplier')$q$,
  'RIDER_LIMIT_EXCEEDED',
  'PER_RIDER: 미배분(null=0) 라이더는 소액도 거부');

-- ============ (5) 좌상 총량이 개인 한도보다 작으면 총량이 이긴다 ============
-- 배분좌상 총량을 4,500으로 축소(이미 4,000 사용) → A에게 1,000 더 주면 총량 5,000>4,500 초과.
update dealer_accounts set credit_limit = 4500 where dealer_id='ca000000-0000-0000-0000-000000000002';
select _mk_point_order('ca000000-0000-0000-0000-000000000405','ca000000-0000-0000-0000-000000000102','ca000000-0000-0000-0000-000000000002', 1.0);
select throws_ok(
  $q$select fn_transition_order('ca000000-0000-0000-0000-000000000405','CONFIRM_MEASURE','ca000000-0000-0000-0000-000000000201','supplier')$q$,
  'DEALER_LIMIT_EXCEEDED',
  '총량 게이트가 개인 한도보다 먼저 잡는다(총량이 최종 방어선)');
update dealer_accounts set credit_limit = 100000 where dealer_id='ca000000-0000-0000-0000-000000000002';

-- ============ (6) v_rider_credit 계산 ============
select is((select limit_amount from v_rider_credit where rider_id='ca000000-0000-0000-0000-000000000102'), 5000,
  'v_rider_credit: PER_RIDER 라이더의 limit_amount = 개인 한도 5,000');
select is((select used from v_rider_credit where rider_id='ca000000-0000-0000-0000-000000000102'), 4000,
  'v_rider_credit: used = 본인 미정산 POINT 순액 4,000');
select is((select available from v_rider_credit where rider_id='ca000000-0000-0000-0000-000000000102'), 1000,
  'v_rider_credit: available = 5,000-4,000 = 1,000');
select is((select limit_amount from v_rider_credit where rider_id='ca000000-0000-0000-0000-000000000101'), 100000,
  'v_rider_credit: POOL 라이더는 좌상 총량이 limit_amount');

-- ============ (7) 정산 청구 후 개인 한도 회복 ============
-- 배분좌상 미정산분을 청구로 스탬핑 → used가 0으로 떨어져야 한다(R4 같은 분모).
select fn_create_dealer_claim('ca000000-0000-0000-0000-000000000002', null);
select is((select used from v_rider_credit where rider_id='ca000000-0000-0000-0000-000000000102'), 0,
  '청구 스탬핑 후 라이더 used 회복(0)');

-- ============ (8) 라이더 셀프 credit_limit 변조 차단(R9) ============
-- guard_rider_verify는 current_user가 service_role/postgres가 아닐 때만 되돌린다. 테스트 하네스는
-- postgres로 실행되므로 트리거 예외 경로에 걸린다 → 가드 로직 자체를 함수 정의로 검증한다.
select ok(
  (select pg_get_functiondef(oid) like '%new.credit_limit := old.credit_limit%'
   from pg_proc where proname = 'guard_rider_verify'),
  'guard_rider_verify가 credit_limit 셀프 변경을 되돌린다(R9)');

drop function _mk_point_order(uuid, uuid, uuid, numeric);
select * from finish();
rollback;
