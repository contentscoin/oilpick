-- pgTAP: [16 L6] v_dealer_active_orders (20260802000002).
-- 고정하는 계약: ① 재무 컬럼 부재(컬럼 집합 고정) ② 좌상은 자기 귀속(스냅샷)분만 ③ 진행중
-- 상태만 ④ 재배정 라이더의 표시명 폴백(이름 미누출) — 16 §5-1.
create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

-- ── 픽스처: 좌상 2 + 라이더 1(좌상A 소속) + 점주 1 + 주문들 ─────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('ad000000-0000-0000-0000-00000000000a'::uuid),  -- 좌상 A
  ('ad000000-0000-0000-0000-00000000000b'::uuid),  -- 좌상 B
  ('ad000000-0000-0000-0000-000000000101'::uuid),  -- 라이더
  ('ad000000-0000-0000-0000-000000000001'::uuid)   -- 점주
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('ad000000-0000-0000-0000-00000000000a','dealer','0','좌상A'),
  ('ad000000-0000-0000-0000-00000000000b','dealer','0','좌상B'),
  ('ad000000-0000-0000-0000-000000000101','rider','0','라이더김'),
  ('ad000000-0000-0000-0000-000000000001','supplier','0','점주');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('ad000000-0000-0000-0000-000000000001','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online, dealer_id, last_location) values
  ('ad000000-0000-0000-0000-000000000101','b','01','APPROVED',true,'ad000000-0000-0000-0000-00000000000a',
   ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography)
  on conflict (id) do nothing;

-- 진행중 주문(수락 → dealer_id 스냅샷 트리거) + 완료 주문 1건.
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
select ('ad000000-0000-0000-0000-00000000020' || n)::uuid,
       'ad000000-0000-0000-0000-000000000001','REQUESTED',10,'서울 강서구 화곡로 1',
       ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700
from generate_series(1,2) as n;
select fn_transition_order('ad000000-0000-0000-0000-000000000201','ACCEPT','ad000000-0000-0000-0000-000000000101','rider');
select fn_transition_order('ad000000-0000-0000-0000-000000000202','ACCEPT','ad000000-0000-0000-0000-000000000101','rider');

-- ── ① 컬럼 집합 고정 — 재무 컬럼(cash_paid_amount·net_amount·snapshot_*)이 없다 ──
select columns_are('public', 'v_dealer_active_orders',
  array['order_id','status','order_kind','rider_id','rider_name','pickup_address',
        'purchase_requested_cans','delivered_cans','accepted_at','arrived_at','created_at'],
  '재무 컬럼 제외 최소 컬럼 집합(14 §2-5) — DB가 강제');

-- ── ② 좌상 A: 자기 귀속(스냅샷) 진행중 주문 2건 + 표시명(현 소속이라 실명) ──
set local role authenticated;
set local request.jwt.claims to '{"sub":"ad000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from v_dealer_active_orders), 2, '좌상A: 귀속 진행중 2건');
select is((select rider_name from v_dealer_active_orders where order_id='ad000000-0000-0000-0000-000000000201'),
          '라이더김', '현 소속 라이더는 실명 표시(p_profiles_read_own_riders)');

-- ── ③ 좌상 B: 타 좌상 귀속분 0건 ──
set local request.jwt.claims to '{"sub":"ad000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from v_dealer_active_orders), 0, '좌상B: 타 좌상 주문 0건');

-- ── ④ 재배정: 라이더가 좌상B로 옮겨도 스냅샷 주문은 좌상A 귀속 유지 + 표시명 폴백 ──
reset role;
update rider_profiles set dealer_id='ad000000-0000-0000-0000-00000000000b'
 where id='ad000000-0000-0000-0000-000000000101';
set local role authenticated;
set local request.jwt.claims to '{"sub":"ad000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from v_dealer_active_orders), 2, '재배정 후에도 스냅샷 귀속 불변(14 §2-6)');
select is((select rider_name from v_dealer_active_orders where order_id='ad000000-0000-0000-0000-000000000201'),
          '라이더 ad000000', '전 소속 라이더는 실명 대신 rider_id 축약 폴백(이름 미누출)');

-- ── ⑤ 완료 주문은 목록에 없다(진행중 필터) ──
reset role;
select fn_transition_order('ad000000-0000-0000-0000-000000000201','ARRIVE','ad000000-0000-0000-0000-000000000101','rider');
select fn_transition_order('ad000000-0000-0000-0000-000000000201','SUBMIT_MEASURE','ad000000-0000-0000-0000-000000000101','rider',
  jsonb_build_object('measuredKg', 10, 'photoUrls', jsonb_build_array('p.jpg'), 'payoutMethod', 'CASH'));
select fn_transition_order('ad000000-0000-0000-0000-000000000201','CONFIRM_MEASURE','ad000000-0000-0000-0000-000000000001','supplier');
set local role authenticated;
set local request.jwt.claims to '{"sub":"ad000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from v_dealer_active_orders), 1, 'COMPLETED는 관제 목록에서 빠진다');
select is((select status::text from v_dealer_active_orders limit 1), 'ACCEPTED', '남은 건은 진행중 상태');

select * from finish();
rollback;
