-- pgTAP: [16 L9] v_my_payout_daily (20260802000003).
-- 고정하는 계약: ① 본인 스코프(타 라이더 행 0건 — 필수) ② point_amount = EARN 발행액(net 기준
-- 미러 — gross 드리프트 재도입 방지) ③ CASH는 정산 집계와 분리.
create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

-- ── 픽스처: 라이더 2 + 점주 1. 라이더1이 POINT 주문 1건 완료(40kg×700 = 28,000P EARN). ──
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('ae000000-0000-0000-0000-000000000001'::uuid),  -- 점주
  ('ae000000-0000-0000-0000-000000000101'::uuid),  -- 라이더1
  ('ae000000-0000-0000-0000-000000000102'::uuid)   -- 라이더2
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('ae000000-0000-0000-0000-000000000001','supplier','0','점주'),
  ('ae000000-0000-0000-0000-000000000101','rider','0','라이더1'),
  ('ae000000-0000-0000-0000-000000000102','rider','0','라이더2');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('ae000000-0000-0000-0000-000000000001','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online, last_location)
select id, 'b', '01', 'APPROVED', true, ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography
from (values ('ae000000-0000-0000-0000-000000000101'::uuid), ('ae000000-0000-0000-0000-000000000102'::uuid)) as v(id)
on conflict (id) do nothing;

insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
values ('ae000000-0000-0000-0000-000000000201','ae000000-0000-0000-0000-000000000001','REQUESTED',40,'a',
        ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700);
select fn_transition_order('ae000000-0000-0000-0000-000000000201','ACCEPT','ae000000-0000-0000-0000-000000000101','rider');
select fn_transition_order('ae000000-0000-0000-0000-000000000201','ARRIVE','ae000000-0000-0000-0000-000000000101','rider');
select fn_transition_order('ae000000-0000-0000-0000-000000000201','SUBMIT_MEASURE','ae000000-0000-0000-0000-000000000101','rider',
  jsonb_build_object('measuredKg', 40, 'photoUrls', jsonb_build_array('p.jpg'), 'payoutMethod', 'POINT'));
select fn_transition_order('ae000000-0000-0000-0000-000000000201','CONFIRM_MEASURE','ae000000-0000-0000-0000-000000000001','supplier');

-- ── ① 라이더1: 본인 실적 1행, point_amount = EARN 발행액(28,000) ──
set local role authenticated;
set local request.jwt.claims to '{"sub":"ae000000-0000-0000-0000-000000000101","role":"authenticated"}';
select is((select count(*)::int from v_my_payout_daily), 1, '라이더1: 본인 일별 실적 1행');
select is((select point_amount::int from v_my_payout_daily limit 1), 28000,
          'point_amount = EARN 발행액(net 기준 — 40kg×700P)');
select is((select cash_amount::int from v_my_payout_daily limit 1), 0, 'CASH 지급 없음 — 0');

-- ── ④ 원장 대사: 뷰 point_amount(28,000, 위에서 확인) = point_ledger EARN 발행액 ──
-- (EARN은 supplier에게 발행되므로 라이더 세션에서는 RLS로 안 보인다 — postgres로 확인.)
reset role;
select is(
  (select coalesce(sum(amount),0)::int from point_ledger
    where order_id='ae000000-0000-0000-0000-000000000201' and entry_type='EARN'),
  28000,
  'point_ledger EARN 합 = 뷰 point_amount(대사 일치 — 08 P5)');
set local role authenticated;

-- ── ② 라이더2: 타인 실적 0행(본인 스코프 필수) ──
set local request.jwt.claims to '{"sub":"ae000000-0000-0000-0000-000000000102","role":"authenticated"}';
select is((select count(*)::int from v_my_payout_daily), 0, '라이더2: 타 라이더 행 0건');

-- ── ③ 미인증(auth.uid() null) — 0행 ──
set local request.jwt.claims to '{}';
select is((select count(*)::int from v_my_payout_daily), 0, '비로그인: 0건');

select * from finish();
rollback;
