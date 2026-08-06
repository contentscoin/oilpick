-- pgTAP: [19 T2] 바코드 유통이력 뷰 v_barcode_trace / v_barcode_summary (20260806000004).
-- 고정하는 계약: ① 컬럼 집합 ② security_invoker 설정 ③ admin=전체 / 당사자=본인분 /
-- 좌상=0행(pickup_items 읽기 정책 없음 — 19 §1 T2 가시성 결정) ④ 회차 집계(같은 바코드가
-- 여러 주문에 재등장) ⑤ last_order_id = 최근 회수 주문.
create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

-- ── 픽스처: admin 1 + 좌상 1 + 라이더 1(좌상 소속) + 점주 2 + 주문 2 ────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('bc000000-0000-0000-0000-0000000000ad'::uuid),  -- admin
  ('bc000000-0000-0000-0000-00000000000d'::uuid),  -- 좌상
  ('bc000000-0000-0000-0000-000000000101'::uuid),  -- 라이더
  ('bc000000-0000-0000-0000-000000000001'::uuid),  -- 점주1
  ('bc000000-0000-0000-0000-000000000002'::uuid)   -- 점주2
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('bc000000-0000-0000-0000-0000000000ad','admin','0','관리자'),
  ('bc000000-0000-0000-0000-00000000000d','dealer','0','좌상갑'),
  ('bc000000-0000-0000-0000-000000000101','rider','0','라이더김'),
  ('bc000000-0000-0000-0000-000000000001','supplier','0','점주1'),
  ('bc000000-0000-0000-0000-000000000002','supplier','0','점주2');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('bc000000-0000-0000-0000-000000000001','b1','김밥천국 화곡점','서울 강서구 화곡로 1',
   ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography),
  ('bc000000-0000-0000-0000-000000000002','b2','치킨나라 등촌점','서울 강서구 등촌로 2',
   ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online, dealer_id, last_location) values
  ('bc000000-0000-0000-0000-000000000101','rb','12가3456','APPROVED',true,
   'bc000000-0000-0000-0000-00000000000d', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);

-- 주문 2건(서로 다른 점주) — 같은 바코드 'BC-001'이 두 주문에 회차를 달리해 등장한다.
insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
values
  ('bc000000-0000-0000-0000-000000000201','bc000000-0000-0000-0000-000000000001','REQUESTED',10,
   '서울 강서구 화곡로 1', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography, 700),
  ('bc000000-0000-0000-0000-000000000202','bc000000-0000-0000-0000-000000000002','REQUESTED',20,
   '서울 강서구 등촌로 2', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography, 700);
select fn_transition_order('bc000000-0000-0000-0000-000000000201','ACCEPT','bc000000-0000-0000-0000-000000000101','rider');
select fn_transition_order('bc000000-0000-0000-0000-000000000202','ACCEPT','bc000000-0000-0000-0000-000000000101','rider');

-- 회수 이벤트: 주문201에 BC-001(1회차)·BC-002, 주문202에 BC-001(2회차, 더 최근).
insert into pickup_items (order_id, rider_id, barcode, geo_lat, geo_lng, captured_at) values
  ('bc000000-0000-0000-0000-000000000201','bc000000-0000-0000-0000-000000000101','BC-001',37.5,127.0, now() - interval '10 days'),
  ('bc000000-0000-0000-0000-000000000201','bc000000-0000-0000-0000-000000000101','BC-002',37.5,127.0, now() - interval '10 days'),
  ('bc000000-0000-0000-0000-000000000202','bc000000-0000-0000-0000-000000000101','BC-001',37.6,127.1, now() - interval '1 day');

-- ── ① 컬럼 집합 고정 ──────────────────────────────────────────────────────
select columns_are('public', 'v_barcode_trace',
  array['barcode','item_id','order_id','rider_id','rider_name','vehicle_number','supplier_id',
        'store_name','pickup_address','dealer_id','dealer_name','order_status','order_kind',
        'measured_kg','final_kg','payout_method','cash_paid_amount','purchase_amount','net_amount',
        'dealer_settlement_id','settlement_status','photo_url','geo_lat','geo_lng','captured_at',
        'recorded_at','seen_at','order_created_at','completed_at'],
  'v_barcode_trace 컬럼 집합 고정(19 §1 T2)');

select columns_are('public', 'v_barcode_summary',
  array['barcode','pickup_count','order_count','rider_count','first_seen_at','last_seen_at',
        'last_order_id','last_rider_id'],
  'v_barcode_summary 컬럼 집합 고정(19 §1 T2)');

-- ── ② security_invoker = true (RLS 우회 경로가 되지 않게) ──────────────────
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class where relname = 'v_barcode_trace'),
  'v_barcode_trace는 security_invoker(기저 RLS 위임)');
select ok(
  (select 'security_invoker=true' = any(reloptions) from pg_class where relname = 'v_barcode_summary'),
  'v_barcode_summary는 security_invoker(기저 RLS 위임)');

-- ── ③ admin 시점: 전체 3행 / 바코드 2종 ────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"bc000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is((select count(*)::int from v_barcode_trace), 3, 'admin: 회수 이벤트 전체 3건');
select is((select count(*)::int from v_barcode_summary), 2, 'admin: 바코드 2종');

-- 연결값(매장명·라이더명·차량번호)이 실제로 붙는다 — "데이터 연결값 정리"의 회귀 방어.
select is(
  (select store_name from v_barcode_trace
    where barcode='BC-001' and order_id='bc000000-0000-0000-0000-000000000202'),
  '치킨나라 등촌점', 'admin: 매장명이 연결된다');
select is(
  (select rider_name || '/' || vehicle_number from v_barcode_trace
    where barcode='BC-002' limit 1),
  '라이더김/12가3456', 'admin: 라이더명·차량번호가 연결된다');

-- ── ④ 집계: BC-001은 2회차·2주문, 최근 회수 주문은 202 ─────────────────────
select is((select pickup_count from v_barcode_summary where barcode='BC-001'), 2,
  'BC-001 회수 2회(같은 바코드 재등장)');
select is((select last_order_id from v_barcode_summary where barcode='BC-001'),
  'bc000000-0000-0000-0000-000000000202'::uuid, 'BC-001 최근 회수 주문 = 202');

-- ── ⑤ 점주1 시점: 자기 주문(201)분 2건만 ───────────────────────────────────
set local request.jwt.claims to '{"sub":"bc000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from v_barcode_trace), 2, '점주1: 자기 주문 회수분만(2건)');

-- ── ⑥ 좌상 시점: pickup_items 읽기 정책 없음 → 0행(19 §1 T2 가시성 결정) ────
set local request.jwt.claims to '{"sub":"bc000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is((select count(*)::int from v_barcode_trace), 0,
  '좌상: 유통이력 0행(admin 전용 — pickup_items 읽기 정책 없음)');

reset role;
reset request.jwt.claims;
select * from finish();
rollback;
