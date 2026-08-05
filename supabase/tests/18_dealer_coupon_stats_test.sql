-- pgTAP: [17 Q5] 좌상 쿠폰 실적 — v_dealer_rider_stats.coupon_used_qty (20260805000001).
-- 고정하는 계약:
--   ① 컬럼 append-only — 기존 컬럼 집합 + coupon_used_qty만(순서 끝).
--   ② 값 = 소속 라이더의 **완료(COMPLETED) 주문 coupon_cost 합**. 미완료 주문 제외,
--      레거시(coupon_cost null)는 0(전환기 혼재 — 17 리스크).
--   ③ 좌상 범위 = 자기 소속만(타 좌상 라이더 행 없음). 기존 집계(completed_count) 회귀 무결.
--   ④ 경로 제약의 근거 — coupon_ledger는 본인+admin RLS라 좌상 조회 시 항상 0행
--      (조인했다면 무음 결손이 됐을 것 → pickup_orders.coupon_cost 경유가 유일 경로, 17 C5).
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(10);

-- ── 픽스처: 좌상 2 + 라이더 3(좌상1 소속 2, 좌상2 소속 1) + 점주 1 ──────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('cc000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cdeal1@t',now(),now()),
  ('cc000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cdeal2@t',now(),now()),
  ('cc000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','crid1@t',now(),now()),
  ('cc000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','crid2@t',now(),now()),
  ('cc000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','crid3@t',now(),now()),
  ('cc000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','csup1@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('cc000000-0000-0000-0000-0000000000d1','dealer','030','쿠폰좌상1'),
  ('cc000000-0000-0000-0000-0000000000d2','dealer','031','쿠폰좌상2'),
  ('cc000000-0000-0000-0000-0000000000b1','rider','032','쿠폰라이더1'),
  ('cc000000-0000-0000-0000-0000000000b2','rider','033','쿠폰라이더2'),
  ('cc000000-0000-0000-0000-0000000000b3','rider','034','레거시라이더'),
  ('cc000000-0000-0000-0000-0000000000a1','supplier','035','쿠폰점주1');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('cc000000-0000-0000-0000-0000000000a1','b','s1','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, dealer_id) values
  ('cc000000-0000-0000-0000-0000000000b1','b','11가1','APPROVED','cc000000-0000-0000-0000-0000000000d1'),
  ('cc000000-0000-0000-0000-0000000000b2','b','12나2','APPROVED','cc000000-0000-0000-0000-0000000000d2'),
  ('cc000000-0000-0000-0000-0000000000b3','b','13다3','APPROVED','cc000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

-- 주문 픽스처(dealer_id는 ACCEPT 스냅샷 트리거가 하는 일을 픽스처가 대신 — 10_dealer_test 선례).
--   b1: 완료 2건(coupon_cost 2, 3 = 합 5) + 미완료(ACCEPTED) 1건(coupon_cost 7 — 미집계 대상)
--   b3: 완료 1건(coupon_cost null — 레거시·전환기 → 0)
--   b2(좌상2 소속): 완료 1건(coupon_cost 4)
insert into pickup_orders
  (id, supplier_id, rider_id, dealer_id, status, requested_kg, pickup_address, pickup_location,
   snapshot_price_per_kg, coupon_cost, measured_kg, final_kg, payout_method, cash_paid_amount, completed_at)
values
  ('cc000000-0000-0000-0000-00000000e001','cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000b1',
   'cc000000-0000-0000-0000-0000000000d1','COMPLETED', 30, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, 2, 30, 30, 'CASH', 21000, now()),
  ('cc000000-0000-0000-0000-00000000e002','cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000b1',
   'cc000000-0000-0000-0000-0000000000d1','COMPLETED', 45, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, 3, 45, 45, 'CASH', 31500, now()),
  ('cc000000-0000-0000-0000-00000000e003','cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000b1',
   'cc000000-0000-0000-0000-0000000000d1','ACCEPTED', 100, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, 7, null, null, null, null, null),
  ('cc000000-0000-0000-0000-00000000e004','cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000b3',
   'cc000000-0000-0000-0000-0000000000d1','COMPLETED', 15, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, null, 15, 15, 'CASH', 10500, now()),
  ('cc000000-0000-0000-0000-00000000e005','cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000b2',
   'cc000000-0000-0000-0000-0000000000d2','COMPLETED', 60, 'a', ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,
   700, 4, 60, 60, 'CASH', 42000, now());

-- b1의 쿠폰 원장 잔존 행(④의 RLS 시연용 — ADJUST는 purchase/order 동반 불요).
insert into coupon_ledger (rider_id, entry_type, qty, memo)
values ('cc000000-0000-0000-0000-0000000000b1','ADJUST', 5, '[pgTAP] 좌상 RLS 0행 시연 픽스처');

-- ── ① 컬럼 집합 고정 — 기존 컬럼 + coupon_used_qty append(append-only 계약) ──
select columns_are('public', 'v_dealer_rider_stats',
  array['rider_id','dealer_id','rider_name','verify_status','is_online','completed_count',
        'collected_kg','cash_paid','point_paid','referral_signed_up','referral_activated',
        'coupon_used_qty'],
  '기존 컬럼 전부 보존 + coupon_used_qty만 append(17 Q5)');

-- ── ② 픽스처 대사(superuser) — 완료 주문 coupon_cost 직합 = 기대값 5 ──
select is(
  (select coalesce(sum(coupon_cost),0)::int from pickup_orders
    where rider_id = 'cc000000-0000-0000-0000-0000000000b1' and status = 'COMPLETED'),
  5, '픽스처: b1 완료 주문 coupon_cost 직합 = 5(뷰 기대값과 동일 소스)');

-- ── ③ 좌상1 — 자기 소속 2행, 값 = 완료 합(미완료 제외)·레거시 0·기존 집계 회귀 ──
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select is((select count(*) from v_dealer_rider_stats)::int, 2, '좌상1 통계 뷰는 소속 라이더 2행');
select is((select coupon_used_qty from v_dealer_rider_stats where rider_id = 'cc000000-0000-0000-0000-0000000000b1'),
  5, 'b1 coupon_used_qty = 완료 주문 합 5(미완료 ACCEPTED의 7은 미집계)');
select is((select coupon_used_qty from v_dealer_rider_stats where rider_id = 'cc000000-0000-0000-0000-0000000000b3'),
  0, '레거시(coupon_cost null) 완료 주문만 있는 b3는 0(전환기 혼재 규약)');
select is((select completed_count from v_dealer_rider_stats where rider_id = 'cc000000-0000-0000-0000-0000000000b1')::int,
  2, '기존 집계 회귀 무결 — b1 completed_count = 2');
select is((select count(*) from v_dealer_rider_stats where rider_id = 'cc000000-0000-0000-0000-0000000000b2')::int,
  0, '좌상1은 좌상2 소속 b2 행을 보지 못함(0행)');

-- ── ④ 경로 제약의 근거 — coupon_ledger는 좌상에게 항상 0행(본인+admin RLS) ──
select is((select count(*) from coupon_ledger where rider_id = 'cc000000-0000-0000-0000-0000000000b1')::int,
  0, '좌상1의 coupon_ledger 조회는 0행 — 조인했다면 무음 결손(17 C5 조인 금지 사유)');
reset role;
select is((select count(*) from coupon_ledger where rider_id = 'cc000000-0000-0000-0000-0000000000b1')::int,
  1, '(대조) superuser는 같은 원장 행을 봄 — 0행이 RLS 때문임을 고정');

-- ── ⑤ 좌상2 — 자기 라이더 값 ──
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select is((select coupon_used_qty from v_dealer_rider_stats where rider_id = 'cc000000-0000-0000-0000-0000000000b2'),
  4, '좌상2: b2 coupon_used_qty = 4');
reset role;

select * from finish();
rollback;
