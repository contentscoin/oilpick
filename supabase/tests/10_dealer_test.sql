-- pgTAP: 13 좌상(dealer) 조직 계층 — 소속·권한가드·RLS 조회 범위·통계 뷰.
--   - dealer_id 셀프변경 차단(guard_rider_verify 확장).
--   - 좌상은 자기 소속만 조회(rider_profiles/profiles/orders/referrals RLS).
--   - 남의 소속·미배정은 안 보임. v_dealer_rider_stats 범위·집계.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- ── 픽스처: 좌상 2 + 라이더 2(각 좌상 소속) + 미배정 라이더 1 + 점주 1 ──────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('dd000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal1@t',now(),now()),
  ('dd000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deal2@t',now(),now()),
  ('dd000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','drid1@t',now(),now()),
  ('dd000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','drid2@t',now(),now()),
  ('dd000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','drid3@t',now(),now()),
  ('dd000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dsup1@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('dd000000-0000-0000-0000-0000000000d1','dealer','020','좌상1'),
  ('dd000000-0000-0000-0000-0000000000d2','dealer','021','좌상2'),
  ('dd000000-0000-0000-0000-0000000000b1','rider','022','소속라이더1'),
  ('dd000000-0000-0000-0000-0000000000b2','rider','023','소속라이더2'),
  ('dd000000-0000-0000-0000-0000000000b3','rider','024','미배정라이더'),
  ('dd000000-0000-0000-0000-0000000000a1','supplier','025','점주1');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('dd000000-0000-0000-0000-0000000000a1','b','s1','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, dealer_id) values
  ('dd000000-0000-0000-0000-0000000000b1','b','01가1','APPROVED','dd000000-0000-0000-0000-0000000000d1'),
  ('dd000000-0000-0000-0000-0000000000b2','b','02나2','APPROVED','dd000000-0000-0000-0000-0000000000d2'),
  ('dd000000-0000-0000-0000-0000000000b3','b','03다3','PENDING',null)
  on conflict (id) do nothing;

-- 소속 라이더1의 완료 주문 1건(통계 소스)
insert into pickup_orders
  (id, supplier_id, rider_id, status, requested_kg, pickup_address, pickup_location,
   snapshot_price_per_kg, snapshot_rider_fee, measured_kg, final_kg, payout_method, cash_paid_amount, completed_at)
values
  ('dd000000-0000-0000-0000-00000000e001','dd000000-0000-0000-0000-0000000000a1','dd000000-0000-0000-0000-0000000000b1',
   'COMPLETED', 30, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, 5000, 32, 32, 'CASH', 22400, now());

-- ============ (1) 권한가드: dealer_id 셀프변경 차단 ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
update rider_profiles set dealer_id = 'dd000000-0000-0000-0000-0000000000d2'
  where id = 'dd000000-0000-0000-0000-0000000000b1';
reset role;
select is(
  (select dealer_id from rider_profiles where id = 'dd000000-0000-0000-0000-0000000000b1'),
  'dd000000-0000-0000-0000-0000000000d1'::uuid,
  '라이더가 자기 dealer_id를 임의 변경 못함(guard 고정)');

-- ============ (2) fn_dealer_owns_rider ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select ok(fn_dealer_owns_rider('dd000000-0000-0000-0000-0000000000b1'), '좌상1은 소속 라이더1을 소유');
select ok(not fn_dealer_owns_rider('dd000000-0000-0000-0000-0000000000b2'), '좌상1은 좌상2 소속을 소유하지 않음');
select ok(not fn_dealer_owns_rider('dd000000-0000-0000-0000-0000000000b3'), '좌상1은 미배정 라이더를 소유하지 않음');
reset role;

-- ============ (3) rider_profiles RLS — 좌상은 자기 소속만 ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from rider_profiles)::int, 1, '좌상1 rider_profiles 조회는 소속 1명만');
select is((select count(*) from rider_profiles where id = 'dd000000-0000-0000-0000-0000000000b1')::int, 1,
  '좌상1은 자기 소속 라이더1을 봄');
select is((select count(*) from rider_profiles where id = 'dd000000-0000-0000-0000-0000000000b2')::int, 0,
  '좌상1은 좌상2 소속 라이더2를 못 봄');
reset role;

-- ============ (4) profiles RLS — 소속 라이더 프로필 ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from profiles where id = 'dd000000-0000-0000-0000-0000000000b1')::int, 1,
  '좌상1은 소속 라이더1 프로필(이름/전화)을 봄');
select is((select count(*) from profiles where id = 'dd000000-0000-0000-0000-0000000000b2')::int, 0,
  '좌상1은 좌상2 소속 라이더2 프로필을 못 봄');
reset role;

-- ============ (5) pickup_orders RLS — 소속 라이더 주문 ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from pickup_orders where rider_id = 'dd000000-0000-0000-0000-0000000000b1')::int, 1,
  '좌상1은 소속 라이더1의 주문을 봄');
reset role;

-- ============ (6) v_dealer_rider_stats — 범위·집계 ============
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from v_dealer_rider_stats)::int, 1, '좌상1 통계 뷰는 소속 라이더 1행');
select is((select collected_kg from v_dealer_rider_stats where rider_id = 'dd000000-0000-0000-0000-0000000000b1')::numeric,
  32::numeric, '소속 라이더1 수거 kg 집계(32)');
select is((select cash_paid from v_dealer_rider_stats where rider_id = 'dd000000-0000-0000-0000-0000000000b1')::int,
  22400, '소속 라이더1 현금 지급 집계(22,400)');
reset role;

select * from finish();
rollback;
