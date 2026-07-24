-- pgTAP: 14 J1 수거 추적 — arrived_at 스탬프 + pickup_items(바코드 1급) replace-set + RLS.
--   - ARRIVE가 arrived_at을 채운다(타임라인 '-' 해소).
--   - SUBMIT_MEASURE가 barcodes/geo를 pickup_items에 적재하고, 재제출 시 세트를 교체(replace-set)한다.
--   - 배열 내 중복 바코드는 unique(order_id,barcode)로 1건만 남는다.
--   - barcodes 부재 재제출은 pickup_items를 건드리지 않는다(구번들·재제출 호환).
--   - RLS: 주문 당사자(supplier/rider)+admin만 pickup_items를 읽고, 무관 점주는 못 본다.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ── 픽스처: 점주(주문 소유) + 무관 점주 + 승인 라이더 + admin + 주문 1건(신모델) ──
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('a1a10000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tsup1@t',now(),now()),
  ('a1a10000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tsup2@t',now(),now()),
  ('a1a10000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','trid1@t',now(),now()),
  ('a1a10000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tadm1@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('a1a10000-0000-0000-0000-000000000001','supplier','030','점주소유'),
  ('a1a10000-0000-0000-0000-000000000002','supplier','031','무관점주'),
  ('a1a10000-0000-0000-0000-000000000011','rider','032','라이더1'),
  ('a1a10000-0000-0000-0000-0000000000a1','admin','033','관리자');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('a1a10000-0000-0000-0000-000000000001','b','s1','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography),
  ('a1a10000-0000-0000-0000-000000000002','b','s2','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('a1a10000-0000-0000-0000-000000000011','b','99가9','APPROVED')
  on conflict (id) do nothing;

insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('a1a10000-0000-0000-0000-0000000000e1','a1a10000-0000-0000-0000-000000000001','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,null);

-- ============ (1) arrived_at: ARRIVE 전 null → ARRIVE 후 스탬프 ============
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','ACCEPT','a1a10000-0000-0000-0000-000000000011','rider');
select ok((select arrived_at is null from pickup_orders where id='a1a10000-0000-0000-0000-0000000000e1'),
  'ARRIVE 전 arrived_at은 null');
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','ARRIVE','a1a10000-0000-0000-0000-000000000011','rider');
select ok((select arrived_at is not null from pickup_orders where id='a1a10000-0000-0000-0000-0000000000e1'),
  'ARRIVE가 arrived_at을 스탬프');

-- ============ (2) SUBMIT_MEASURE barcodes/geo 적재 ============
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a10000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodes":["AAA","BBB"],"geo":{"lat":37.5,"lng":127.0,"capturedAt":"2026-07-24T01:00:00Z"}}'::jsonb);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 2,
  '바코드 2개 적재');
select is((select geo_lat from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1' and barcode='AAA'), 37.5,
  'geo_lat 기록');
select ok((select captured_at is not null from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1' and barcode='AAA'),
  'captured_at 기록');
select is((select rider_id from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1' and barcode='AAA'),
  'a1a10000-0000-0000-0000-000000000011'::uuid, 'rider_id 기록(제출 라이더)');

-- ============ (3) 재제출 replace-set: 이전 세트 교체 ============
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a10000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodes":["CCC"]}'::jsonb);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 1,
  '재제출 시 세트 교체(1건)');
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1' and barcode='AAA'), 0,
  '이전 바코드(AAA) 제거');

-- ============ (4) 배열 내 중복 바코드 → 1건만(unique) ============
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a10000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodes":["DDD","DDD"]}'::jsonb);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 1,
  '중복 바코드는 1건만 적재');

-- ============ (5) barcodes 부재 재제출 → pickup_items 무변경(스킵) ============
select fn_transition_order('a1a10000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a10000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":11.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH"}'::jsonb);
select is((select string_agg(barcode, ',') from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 'DDD',
  'barcodes 부재 재제출은 기존 세트 유지(DDD)');

-- ============ (6) RLS: pickup_items 읽기 범위 ============
-- 주문 소유 점주 → 봄
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1a10000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 1,
  '주문 소유 점주는 pickup_items를 봄');
reset role;
-- 무관 점주 → 못 봄
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1a10000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 0,
  '무관 점주는 pickup_items를 못 봄');
reset role;
-- 배정 라이더 → 봄
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1a10000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select is((select count(*)::int from pickup_items where order_id='a1a10000-0000-0000-0000-0000000000e1'), 1,
  '배정 라이더는 pickup_items를 봄');
reset role;

select * from finish();
rollback;
