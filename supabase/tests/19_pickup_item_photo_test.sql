-- pgTAP: [O2, 14 §2 확장] 바코드 사진 첨부 — pickup_items.photo_url + barcodeItems 적재 경로.
--   - SUBMIT_MEASURE payload.barcodeItems([{code, photoUrl?}])로 photo_url까지 적재한다.
--   - 사진 없는 항목은 photo_url null, 사진 단독 등록(photo- 접두 코드)도 일반 행으로 적재된다.
--   - barcodeItems가 있으면 barcodes(text[])보다 우선한다.
--   - 레거시 barcodes(string[]) 경로는 그대로 동작한다(후방 호환 — photo_url null).
--   - 재제출 replace-set: 어느 경로든 이전 세트를 교체하고, 둘 다 부재면 무변경.
--   - 배열 내 중복 코드는 unique(order_id,barcode)로 첫 항목만 남는다.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

-- ── 픽스처: 점주 + 승인 라이더 + 주문 1건(신모델 순수 수거) ──
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('a1a19000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o2sup1@t',now(),now()),
  ('a1a19000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','o2rid1@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('a1a19000-0000-0000-0000-000000000001','supplier','040','점주O2'),
  ('a1a19000-0000-0000-0000-000000000011','rider','041','라이더O2');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('a1a19000-0000-0000-0000-000000000001','b','s1','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status) values
  ('a1a19000-0000-0000-0000-000000000011','b','98가8','APPROVED')
  on conflict (id) do nothing;

insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg, coupon_cost) values
  ('a1a19000-0000-0000-0000-0000000000e1','a1a19000-0000-0000-0000-000000000001','REQUESTED',10.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,null);

select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','ACCEPT','a1a19000-0000-0000-0000-000000000011','rider');
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','ARRIVE','a1a19000-0000-0000-0000-000000000011','rider');

-- ============ (1) barcodeItems 경로: photo_url 포함 적재 ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodeItems":[{"code":"AAA","photoUrl":"https://x/b-aaa.jpg"},{"code":"BBB"}],"geo":{"lat":37.5,"lng":127.0,"capturedAt":"2026-08-05T01:00:00Z"}}'::jsonb);
select is((select count(*)::int from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 2,
  'barcodeItems 2건 적재');
select is((select photo_url from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='AAA'),
  'https://x/b-aaa.jpg', '사진 첨부 항목은 photo_url 기록');
select ok((select photo_url is null from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='BBB'),
  '사진 없는 항목은 photo_url null');
-- geo_lat은 double precision — 11_tracking 선례대로 양쪽 명시 캐스팅.
select is((select geo_lat from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='AAA')::numeric,
  37.5::numeric, 'barcodeItems 경로도 geo 기록');

-- ============ (2) 사진 단독 등록(photo- 접두 코드) + replace-set 교체 ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodeItems":[{"code":"photo-abc12345","photoUrl":"https://x/b-only.jpg"}]}'::jsonb);
select is((select string_agg(barcode, ',') from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 'photo-abc12345',
  '재제출 시 세트 교체(사진 단독 코드 1건, 이전 세트 제거)');
select is((select photo_url from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='photo-abc12345'),
  'https://x/b-only.jpg', '사진 단독 등록 행도 photo_url 기록');

-- ============ (3) 레거시 barcodes(string[]) 경로 후방 호환 ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodes":["CCC"]}'::jsonb);
select is((select string_agg(barcode, ',') from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 'CCC',
  '레거시 barcodes 경로 재제출도 세트 교체(구버전 번들 호환)');
select ok((select photo_url is null from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='CCC'),
  '레거시 경로는 photo_url null');

-- ============ (4) 둘 다 있으면 barcodeItems 우선 ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodeItems":[{"code":"DDD"}],"barcodes":["EEE"]}'::jsonb);
select is((select string_agg(barcode, ',') from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 'DDD',
  '둘 다 있으면 barcodeItems만 적재(barcodes 무시)');

-- ============ (5) 둘 다 부재 재제출 → 무변경 ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":11.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH"}'::jsonb);
select is((select string_agg(barcode, ',') from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 'DDD',
  'barcodeItems·barcodes 둘 다 부재면 기존 세트 유지');

-- ============ (6) 배열 내 중복 코드 → 첫 항목만(unique) ============
select fn_transition_order('a1a19000-0000-0000-0000-0000000000e1','SUBMIT_MEASURE','a1a19000-0000-0000-0000-000000000011','rider',
  '{"measuredKg":10.0,"photoUrls":["https://x/p.jpg"],"payoutMethod":"CASH","barcodeItems":[{"code":"FFF","photoUrl":"https://x/b-fff.jpg"},{"code":"FFF"}]}'::jsonb);
select is((select count(*)::int from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1'), 1,
  '중복 코드는 1건만 적재');
select is((select photo_url from pickup_items where order_id='a1a19000-0000-0000-0000-0000000000e1' and barcode='FFF'),
  'https://x/b-fff.jpg', '중복 시 첫 항목의 photo_url 유지');

select * from finish();
rollback;
