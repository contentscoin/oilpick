-- OilPick DB Schema v1 (단일 진실 — 마이그레이션 작성 시 이 파일 기준)
-- Postgres 15 + PostGIS. Supabase auth.users를 FK 기준으로 사용.

create extension if not exists postgis;

-- ===== enums =====
create type user_role as enum ('supplier','rider','admin');
create type order_status as enum ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP','DELIVERED','COMPLETED','CANCELLED','DISPUTED');
-- [08 P3·P4] 포인트 복권 — 현역: EARN(POINT 지급수단 적립)/WITHDRAW_REQUEST/WITHDRAW_CANCEL/ADJUST.
-- [09 H5] REFERRAL(추천 활성화 시 점주 보너스, +부호·출금 가능) 추가(실 DDL: 20260715000003 alter type add value).
-- 레거시 전용(신규 발행 없음): HOLD/RELEASE(구모델 수거비), PURCHASE(미래 예약).
create type ledger_type as enum ('EARN','HOLD','RELEASE','WITHDRAW_REQUEST','WITHDRAW_CANCEL','ADJUST','PURCHASE','REFERRAL');
-- [09 H2] 라이더 추천 상태(SIGNED_UP=가입, ACTIVATED=첫 수거 완료·보너스 발행, CANCELLED)
create type referral_status as enum ('SIGNED_UP','ACTIVATED','CANCELLED');
-- [07 F2] SUSPENDED 추가(실 마이그레이션은 별도 파일의 alter type add value — 사용 트랜잭션과 분리. 액션·정책은 07 F11)
create type verify_status as enum ('PENDING','APPROVED','REJECTED','SUSPENDED');
create type withdraw_status as enum ('REQUESTED','APPROVED','REJECTED','PAID'); -- [08 P4] 현역 복권(출금 부활)
-- [07 F2] 수거쿠폰 원장 항목 타입 — [08 P1] 레거시(신규 발행 중지, 전환기 CONSUME/REFUND만 잔존)
create type coupon_entry_type as enum ('CHARGE','CONSUME','REFUND','ADJUST');
-- [07 F2] 쿠폰 구매(PG 결제) 상태 — [08 P1] 레거시(coupon-* 함수 일몰)
create type coupon_purchase_status as enum ('PENDING','PAID','FAILED','EXPIRED','REFUNDED');
-- [08 P2] 현장 지급수단(실 DDL: 20260715000001)
create type payout_method as enum ('CASH','POINT');

-- ===== profiles =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  phone text not null,
  display_name text not null,          -- 상호 또는 라이더 이름
  fcm_token text,
  created_at timestamptz not null default now()
);

create table supplier_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  biz_number text not null,            -- 사업자번호
  store_name text not null,
  address text not null,
  location geography(point,4326) not null,
  bank_name text, bank_account text, bank_holder text,  -- 출금 계좌
  created_at timestamptz not null default now()
);
create index idx_supplier_location on supplier_profiles using gist(location);

create table rider_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  biz_number text not null,
  vehicle_number text not null,
  verify_status verify_status not null default 'PENDING',
  reject_reason text,
  doc_biz_url text, doc_vehicle_url text, doc_permit_url text,  -- Storage 경로
  is_online boolean not null default false,
  last_location geography(point,4326),
  last_location_at timestamptz,
  work_radius_km int not null default 15,
  bank_name text, bank_account text, bank_holder text,
  recycler_name text, recycler_contact text,  -- 인계 재활용업체(승인 조건, 07 F11 D5. 실 DDL: 20260709000008)
  referral_code text unique,   -- [09 H2] 라이더 추천코드(Crockford base32 8자, Edge referral-code 생성. APPROVED 코드만 attach 유효. 실 DDL: 20260715000004)
  created_at timestamptz not null default now()
);
create index idx_rider_location on rider_profiles using gist(last_location);

-- ===== 시세 =====
create table price_ticks (
  id bigint generated always as identity primary key,
  price_per_kg int not null check (price_per_kg > 0),   -- 원/kg
  rider_fee int check (rider_fee > 0),                   -- [07 F2] 레거시 — not null 해제, 신규 미기록(CHECK는 NULL 통과). price-set 계약 개정 07 F3b-④
  effective_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index idx_price_ticks_effective on price_ticks (effective_at desc);

-- ===== 집하장 =====
create table depots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  location geography(point,4326) not null,
  qr_secret text not null default encode(gen_random_bytes(16),'hex'),
  is_active boolean not null default true
);

-- ===== 주문 =====
create table pickup_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references supplier_profiles(id),
  rider_id uuid references rider_profiles(id),
  depot_id uuid references depots(id),
  status order_status not null default 'REQUESTED',
  -- 요청 정보
  requested_cans int,                       -- 통 수 (nullable: kg 직접입력 시)
  requested_kg numeric(8,1) not null,       -- 예상 kg
  pickup_address text not null,
  pickup_location geography(point,4326) not null,
  preferred_time text,                      -- '지금' 또는 'YYYY-MM-DD HH:mm'
  -- 스냅샷 (생성 시 고정)
  snapshot_price_per_kg int not null,
  snapshot_rider_fee int,                   -- [07 F2] 레거시 — not null 해제, 신규 미기록
  coupon_cost int,                          -- [08 P1] 레거시 — 07 쿠폰 스냅샷. order-create가 기록 중지(신규 항상 null → CONSUME/REFUND skip)
  -- 확정 정보
  measured_kg numeric(8,1),                 -- 라이더 계량
  final_kg numeric(8,1),                    -- 확정(중재 반영) — 지급액/EARN 계산 기준
  supplier_point int,                       -- 레거시(구모델) — 지급된 EARN
  payout_method payout_method,              -- [08 P2] 현장 지급수단('CASH'|'POINT'). SUBMIT_MEASURE에서 라이더 선택. null=레거시(완료 시 CASH 간주)
  cash_paid_amount int,                     -- [08 P3] 확정 지급액 = round(final_kg × snapshot_price_per_kg). POINT 지급도 이 컬럼(1P=1원). COMPLETED 시 기록
  photo_urls text[] not null default '{}',
  cancel_reason text,
  dispute_reason text,
  broadcast_radius_km int not null default 3,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz,
  completed_at timestamptz                  -- [07 F2] 완료 시각. 레거시 완료 시각 조회는 coalesce(completed_at, delivered_at, picked_up_at)
);
create index idx_orders_status on pickup_orders (status, created_at desc);
create index idx_orders_supplier on pickup_orders (supplier_id, created_at desc);
create index idx_orders_rider on pickup_orders (rider_id, created_at desc);

create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references pickup_orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_id uuid references profiles(id),    -- null = 시스템
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_order_events_order on order_events (order_id, created_at);

-- ===== 포인트 원장 (append-only) =====
-- [08 P3·P4] 현역 복권 — POINT 지급수단의 EARN(fn_transition_order CONFIRM_MEASURE/FORCE_COMPLETE),
-- 출금 WITHDRAW_REQUEST/WITHDRAW_CANCEL(fn_request_withdraw/fn_process_withdraw), admin ADJUST(point-adjust).
-- HOLD/RELEASE는 레거시 전용(신규 발행 없음 — 07 D1 보강 유지). insert는 service_role RPC에만(절대 규칙 1).
create table point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  entry_type ledger_type not null,
  amount int not null,                      -- 양수=증가, 음수=감소. HOLD/RELEASE 부호는 뷰에서 처리
  order_id uuid references pickup_orders(id),
  withdrawal_id uuid,
  memo text,
  created_by uuid references profiles(id),  -- ADJUST 시 admin
  created_at timestamptz not null default now(),
  -- 멱등성: 같은 주문에 같은 타입 중복 지급 방지
  unique (order_id, entry_type, user_id)
);
create index idx_ledger_user on point_ledger (user_id, created_at desc);

-- append-only 강제
-- search_path 고정: Supabase security advisor(function_search_path_mutable) 대응.
create or replace function forbid_ledger_mutation() returns trigger as $$
begin raise exception 'point_ledger is append-only'; end;
$$ language plpgsql set search_path = public;
create trigger trg_ledger_no_update before update or delete on point_ledger
  for each row execute function forbid_ledger_mutation();

-- 잔액 뷰: HOLD는 held로, RELEASE 시 available로 이동
-- 이 뷰는 자체 필터가 없고 point_ledger의 RLS(p_ledger_read: 본인 또는 admin)에 전적으로
-- 의존해 user_id별 접근을 제한한다 — 뷰 소유자(postgres)가 rolbypassrls이므로 반드시
-- `security_invoker = true`로 설정해야(20260704000012_grant_point_balance_view.sql) 호출자
-- 권한으로 point_ledger를 재조회해 RLS가 실제로 평가된다. 이 옵션 없이 authenticated에
-- select만 부여하면 임의 user_id로 타인의 잔액을 조회할 수 있는 정보 노출이 생긴다.
create view v_point_balance
  with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(case
    when entry_type = 'HOLD' then 0
    when entry_type = 'RELEASE' then amount
    else amount end),0)::int as available,
  coalesce(sum(case when entry_type='HOLD' then amount
                    when entry_type='RELEASE' then -amount
                    else 0 end),0)::int as held
from point_ledger group by user_id;

-- ===== 수거쿠폰 [07 F2] — [08 P1] 레거시(신규 발행 중지) =====
-- 07 모델의 플랫폼 수익원이었으나 08 피벗으로 폐기. 테이블·뷰·RPC·과거 데이터는 회계 감사용 보존
-- (삭제 금지). 신규 발행 경로는 order-create의 coupon_cost 중지 + coupon-* Edge Function 삭제로 소멸,
-- 전환기 잔존 주문(coupon_cost not null)의 CONSUME/REFUND 분기만 fn_transition_order에 잔존.

-- 쿠폰 단가 tick (price_ticks 패턴 미러: 전체 read, admin insert, update/delete 정책 없음=정정 불가·신규 tick만)
create table coupon_price_ticks (
  id bigint generated always as identity primary key,
  unit_price int not null check (unit_price > 0),        -- 쿠폰 1장당 가격 (원)
  effective_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);
create index idx_coupon_price_ticks_effective on coupon_price_ticks (effective_at desc);

-- 쿠폰 구매(PG 결제). 쓰기는 Edge Function(coupon-purchase-intent/confirm)만.
create table coupon_purchases (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles(id),
  qty int not null check (qty > 0),
  unit_price int not null check (unit_price > 0),        -- 구매 시점 단가 스냅샷
  amount int not null check (amount > 0),                -- qty × unit_price (원)
  pg_order_id text not null unique,                      -- 토스 주문번호
  payment_key text unique,                               -- 토스 결제키(승인 후 기록) — confirm 멱등 축
  status coupon_purchase_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index idx_coupon_purchases_rider on coupon_purchases (rider_id, created_at desc);

-- 쿠폰 원장 (append-only) — point_ledger의 3중 무결성 패턴을 그대로 미러링(07 §1-1)
create table coupon_ledger (
  id bigint generated always as identity primary key,
  rider_id uuid not null references profiles(id),
  entry_type coupon_entry_type not null,
  qty int not null check (qty <> 0),                     -- +충전/환급, -소진. not null 필수(CHECK는 NULL 통과 → 생략 금지)
  unit_price int check (entry_type <> 'CHARGE' or unit_price > 0),  -- CHARGE 시 단가 스냅샷 필수
  order_id uuid references pickup_orders(id),            -- CONSUME/REFUND 필수
  purchase_id uuid references coupon_purchases(id),      -- CHARGE 필수, PG환불 ADJUST 시 필수
  memo text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- 멱등 ②-1: CONSUME/REFUND 재시도 안전(order 단위). 주의: Postgres NULLS DISTINCT 때문에
  -- order_id가 NULL인 행(CHARGE/ADJUST)은 이 제약의 적용 대상이 아니다(다중 충전 허용 — 의도된 동작).
  unique (order_id, entry_type, rider_id)
);
-- 멱등 ②-2: CHARGE/PG환불 멱등(purchase 단위). purchase_id NULL 행 제외(부분 유니크). CHARGE 멱등은 이 제약 + coupon_purchases 상태 전이가 담당.
create unique index idx_coupon_ledger_purchase on coupon_ledger (purchase_id, entry_type)
  where purchase_id is not null;
create index idx_coupon_ledger_rider on coupon_ledger (rider_id, created_at desc);

-- append-only 강제(01:130 forbid_ledger_mutation 복제, search_path 고정). service_role도 UPDATE/DELETE 불가.
create or replace function forbid_coupon_mutation() returns trigger as $$
begin raise exception 'coupon_ledger is append-only'; end;
$$ language plpgsql set search_path = public;
create trigger trg_coupon_no_update before update or delete on coupon_ledger
  for each row execute function forbid_coupon_mutation();

-- 잔액 뷰: qty 부호를 그대로 누적합(CHARGE/REFUND +, CONSUME −, ADJUST ±).
-- point_ledger와 동일하게 security_invoker=true로 호출자 RLS(p_coupon_ledger_read)를 평가한다.
create view v_coupon_balance
  with (security_invoker = true)
as
select rider_id, coalesce(sum(qty),0)::int as balance
from coupon_ledger group by rider_id;

-- 집계 뷰 2종(v_coupon_sales_daily·v_pickup_stats_daily)은 is_admin() 함수 정의 이후로 이동해 정의(아래 RLS 절 참조).

-- ===== 쿠폰 원장 RPC [07 F3a] — 실 정의는 supabase/migrations/20260709000003_rpc_coupon.sql =====
-- (상태머신·원장 RPC 본문은 이 스키마 파일이 아니라 migrations에 산다 — 기존 fn_transition_order/
--  fn_post_ledger와 동일 관례. 여기엔 계약 시그니처만 기록해 단일 진실을 유지한다.)
-- 둘 다 SECURITY DEFINER + search_path=public + revoke all/grant service_role(절대 규칙 1: 쿠폰 원장
-- insert는 service_role RPC에만). 잔액 음수 방지는 rider 단위 FOR UPDATE 직렬화 후 재계산.
--   fn_charge_coupon(p_rider_id uuid, p_qty int, p_unit_price int default null,
--                    p_purchase_id uuid default null, p_memo text default null,
--                    p_created_by uuid default null) returns coupon_ledger
--     - purchase_id not null → CHARGE(+qty, unit_price 스냅샷 필수, unique(purchase_id,entry_type) 멱등)
--     - purchase_id null     → ADJUST(±qty, admin 수동). 음수 시 잔액 부족이면 raise 'INSUFFICIENT_COUPON'
--   fn_consume_coupon(p_rider_id uuid, p_order_id uuid, p_qty int) returns coupon_ledger
--     - CONSUME(-qty, order_id). 잔액 < qty → raise 'INSUFFICIENT_COUPON'.
--       unique(order_id,'CONSUME',rider_id) 멱등(ACCEPT 재시도 안전).
-- fn_transition_order 시그니처 개정(20260709000004_rpc_transition_pivot.sql): 6번째 인자
--   p_fault text default null 추가(admin CANCEL 귀책, 'SUPPLIER'|'RIDER'|'SYSTEM'). ACCEPT는
--   coupon_cost not null이면 fn_consume_coupon 호출, CONFIRM_MEASURE/FORCE_COMPLETE는 COMPLETED 직행
--   (cash_paid_amount+completed_at), RESOLVE_DISPUTE는 ARRIVED 복귀(final_kg만 확정). 신 액션 FORCE_COMPLETE.
-- fn_transition_order ACCEPT 규제 게이트(20260709000009_rpc_transition_verify_gate.sql, 07 F11-①):
--   ACCEPT 분기에 rider verify_status='APPROVED' 필수 가드 추가(아니면 'RIDER_NOT_ELIGIBLE') — SUSPENDED/
--   미승인 라이더 신규 콜 수락 차단(최심층 방어). 게이트는 ACCEPT에만; 진행 전이는 무게이트(진행중 완결 허용).
-- fn_transition_order 레거시 RELEASE 제거(20260709000010_rpc_transition_drop_legacy_release.sql, 07 D1 보강):
--   DELIVER(레거시 완결) 분기의 fn_post_ledger RELEASE 호출 제거 — 배송 완료는 라이더 지급 이벤트가
--   아니다(라이더는 쿠폰 구매 측). 완결 전이·QR 검증은 유지, 잔존 HOLD는 held 잔존(과거 회계 기록).
-- fn_transition_order 현장 지급수단 개정(20260715000002_rpc_transition_payout.sql, 08 G2-②):
--   SUBMIT_MEASURE가 payload.payoutMethod('CASH'|'POINT')를 검증해 pickup_orders.payout_method 기록
--   (생략·명시적 null이면 CASH 폴백 — 구버전 호환. 유효하지 않은 문자열만 거부. 재제출로 수단 변경
--   가능). CONFIRM_MEASURE/FORCE_COMPLETE는
--   coalesce(payout_method,'CASH')='POINT'면 같은 트랜잭션에서 fn_post_ledger(supplier,'EARN',
--   cash_paid_amount, order_id) 발행 — 포인트 복권의 유일한 적립 경로. 멱등은 point_ledger
--   unique(order_id, entry_type, user_id). ACCEPT/CANCEL의 쿠폰 분기는 전환기 잔존 주문 전용 보존(08 P1).
-- 출금 RPC 복권(08 P4 — 기존 정의 그대로 현역): fn_request_withdraw(20260704000007, user 단위
--   FOR UPDATE 직렬화·최소 10,000P·WITHDRAW_REQUEST(-)+withdrawals insert 원자) /
--   fn_process_withdraw(20260704000008, REQUESTED→APPROVED→PAID / REJECTED 시 WITHDRAW_CANCEL(+) 복구).

-- ===== 쿠폰 구매 확정·환불 RPC [07 F4] — 실 정의는 supabase/migrations/20260709000005_rpc_purchase.sql =====
-- PG 결제(토스페이먼츠) 경로. 둘 다 SECURITY DEFINER + search_path=public + revoke all/grant service_role.
-- 토스 승인/취소 API 호출은 RPC 밖(Edge Function)에서 하고, 성공 후 이 RPC로 원장·상태를 원자 확정한다.
--   fn_confirm_purchase(p_purchase_id uuid, p_payment_key text) returns coupon_ledger
--     - coupon_purchases FOR UPDATE → PAID면 기존 CHARGE 반환(멱등), PENDING이면 status=PAID·payment_key
--       기록 + fn_charge_coupon(CHARGE, purchase_id). 그 외 상태는 raise 'INVALID_TRANSITION'.
--       멱등 3중: 상태 전이 + payment_key unique + unique(purchase_id,'CHARGE').
--   fn_refund_purchase(p_purchase_id uuid, p_qty int, p_admin_id uuid, p_memo text default null) returns coupon_ledger
--     - coupon_purchases FOR UPDATE → status='PAID' 확인(아니면 raise 'INVALID_TRANSITION' — 건당 1회) →
--       환불 qty ≤ 구매 qty → rider 원장 FOR UPDATE 직렬화 + 미사용 잔액 재계산(부족 시 'INSUFFICIENT_COUPON') →
--       ADJUST(-qty, purchase_id 필수, unit_price=구매 건 스냅샷) insert(unique(purchase_id,'ADJUST') 멱등) →
--       status='REFUNDED'. "purchase_id 있는 ADJUST"=PG 환불(v_coupon_sales_daily.pg_refund_qty).

-- ===== [07 F11] 라이더 정지·서류 필수화·인계처 (실 DDL: 20260709000008_rider_recycler.sql +
--       20260709000009_rpc_transition_verify_gate.sql) =====
-- ① 정지/해제: verify_status에 'SUSPENDED'(20260709000001). rider-verify Edge Function에 suspend/reinstate
--    액션(admin 전용, 사유 필수 — reject_reason 재사용). 정지 시 is_online 강제 false. guard_rider_verify는
--    service_role 예외 경로라 Edge Function이 자유롭게 갱신(authenticated 셀프 정지·해제 변조는 트리거로 차단).
--    자동 차단: p_order_open_calls RLS(위)·order-accept Edge 가드·fn_transition_order ACCEPT 게이트가
--    모두 verify_status='APPROVED'를 요구 → SUSPENDED는 콜 조회/수락 불가(진행중 주문은 ACCEPT 외 전이라 완결 허용).
-- ② 서류 필수화: doc_permit_url = "폐기물처리(수집·운반) 신고증명서". rider-verify approve 시 서버 필수
--    검증(없으면 400 VALIDATION_ERROR). 라이더 가입 폼(AuthPage) 업로드 필수 + 안내 카피.
-- ③ 인계처: rider_profiles.recycler_name/recycler_contact(위 테이블 정의). approve 시 서버 필수 검증.
--    본인 update 허용(guard_rider_verify 미보호 컬럼 — p_rider_self RLS 범위 내).

-- ===== [07 F12] CS 문의 티켓 (실 DDL: supabase/migrations/20260709000007_cs_tickets.sql) =====
-- 원장류가 아니므로 클라이언트 insert 허용(무결성 리스크 없음, 07 F12 ①). CASH_DISPUTE=현금 지급 후
-- 분쟁(상태머신 밖 수용처, 07 §1-3). COUPON_PAYMENT=쿠폰 결제/환불 문의(→ admin SettlementPage 환불 연결).
create type cs_category as enum ('ORDER','CASH_DISPUTE','COUPON_PAYMENT','ACCOUNT','ETC');
create type cs_status as enum ('OPEN','IN_PROGRESS','RESOLVED');
create table cs_tickets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  role user_role not null,                                -- 작성자 역할 스냅샷(본인 profiles.role과 일치 강제)
  category cs_category not null,
  order_id uuid references pickup_orders(id),             -- 연결 주문(선택)
  title text not null,
  body text not null,
  status cs_status not null default 'OPEN',
  admin_reply text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_cs_tickets_status on cs_tickets (status, created_at desc);
create index idx_cs_tickets_author on cs_tickets (author_id, created_at desc);
-- 작성자 역할 조회 helper(insert with check의 role 위조 차단). is_admin() 패턴 미러.
create or replace function fn_current_role() returns user_role as
$$ select role from profiles where id = auth.uid() $$
language sql security definer stable set search_path = public;

-- ===== 출금 =====
create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount int not null check (amount >= 10000),
  status withdraw_status not null default 'REQUESTED',
  bank_name text not null, bank_account text not null, bank_holder text not null,
  admin_memo text,
  processed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ===== 알림 =====
create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  link text,                                -- 앱 내 딥링크 경로
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications (user_id, created_at desc);

-- ===== [09 H2] 라이더 추천(레퍼럴) — 실 DDL: 20260715000004_referrals.sql =====
-- 라이더(referrer)가 점주(referred)에게 앱 설치를 영업. 추천으로 가입한 점주가 첫 수거를 완료(활성화)하면
-- 점주에게 REFERRAL 포인트(출금 가능) 적립 + 라이더 추천 실적 집계(라이더 보상은 08 P5 오프라인 정산 근거).
-- 점주 1인 1회(referred_supplier_id unique, 선착순 최초 확정). 쓰기는 service_role RPC에만(절대 규칙 1 확장).
create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_rider_id uuid not null references rider_profiles(id),
  referred_supplier_id uuid not null unique references supplier_profiles(id),  -- 점주 1인 1회
  code text not null,                                       -- 사용된 코드 스냅샷
  status referral_status not null default 'SIGNED_UP',
  supplier_bonus int not null check (supplier_bonus >= 0),  -- 활성화 시 점주 REFERRAL 포인트(가입 시점 스냅샷)
  rider_reward int not null check (rider_reward >= 0),      -- 라이더 오프라인 정산 보상(스냅샷, admin 통계 전용)
  signed_up_at timestamptz not null default now(),
  activated_at timestamptz,                                 -- 활성화(첫 수거 완료) 시각
  activating_order_id uuid references pickup_orders(id)     -- 활성화 유발 주문
);
create index idx_referrals_referrer on referrals (referrer_rider_id, signed_up_at desc);
-- RLS: referrer 본인 or referred 본인 or admin(select). insert/update 정책 부재 = service_role RPC만(아래 RLS 절).
-- Realtime: 라이더 실적 실시간 갱신(alter publication supabase_realtime add table referrals).

-- 추천 RPC [09 H2] — 실 정의는 20260715000004_referrals.sql. 둘 다 SECURITY DEFINER + search_path=public
--   + revoke all/grant service_role(절대 규칙 1: referrals·point_ledger 쓰기는 service_role RPC에만).
--   fn_attach_referral(p_supplier_id uuid, p_code text, p_supplier_bonus int, p_rider_reward int) returns referrals
--     - 코드 정규화(upper/trim) → APPROVED 라이더 해석(없으면 raise 'INVALID_REFERRAL_CODE'). 자기추천 차단.
--       이미 추천된 점주면 기존 행 반환(멱등, 점주 1인 1회). on conflict(referred_supplier_id) do nothing.
--       보너스는 파라미터 스냅샷(core 상수가 단일 진실). gen 직후 best-effort로 referral-attach Edge가 호출.
--   fn_activate_referral(p_supplier_id uuid, p_order_id uuid) returns referrals
--     - referrals FOR UPDATE. status<>'SIGNED_UP'(미추천·이미활성·취소)면 no-op(멱등, null 반환).
--       SIGNED_UP→ACTIVATED 전이 + fn_post_ledger(supplier,'REFERRAL',supplier_bonus,order_id) 발행.
--       order-transition Edge가 완료 전이 성공 후 호출(fn_transition_order 본체 무변경, 09 H7). 멱등은
--       point_ledger unique(order_id,'REFERRAL',user_id).

-- ===== RLS =====
alter table profiles enable row level security;
alter table supplier_profiles enable row level security;
alter table rider_profiles enable row level security;
alter table price_ticks enable row level security;
alter table depots enable row level security;
alter table pickup_orders enable row level security;
alter table order_events enable row level security;
alter table point_ledger enable row level security;
alter table withdrawals enable row level security;
alter table notifications enable row level security;
-- [07 F2] 쿠폰 테이블 RLS
alter table coupon_price_ticks enable row level security;
alter table coupon_purchases enable row level security;
alter table coupon_ledger enable row level security;
-- [07 F12] CS 티켓 RLS
alter table cs_tickets enable row level security;
-- [09 H2] 레퍼럴 RLS
alter table referrals enable row level security;

-- security definer 함수는 search_path를 고정해 하이재킹을 막는다(Supabase security advisor 대응).
create or replace function is_admin() returns boolean as
$$ select exists(select 1 from profiles where id = auth.uid() and role='admin') $$
language sql security definer stable set search_path = public;

-- ===== 집계 뷰 (admin 전용 select) [07 F2] — is_admin() 정의 이후에 배치 =====
-- security_invoker=true + where is_admin() 게이트: 비관리자는 빈 결과(하위 테이블 RLS도 함께 평가).
-- 쿠폰 매출: CHARGE 합계 + REFUND(귀책 환급)·PG환불(purchase_id 있는 ADJUST)·수동조정 구분 병기.
create view v_coupon_sales_daily
  with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  coalesce(sum(qty) filter (where entry_type='CHARGE'),0)::int             as charged_qty,
  coalesce(sum(unit_price*qty) filter (where entry_type='CHARGE'),0)::int  as sales_amount,
  coalesce(sum(qty) filter (where entry_type='REFUND'),0)::int            as refund_qty,          -- 귀책 환급(order 단위)
  coalesce(sum(-qty) filter (where entry_type='ADJUST' and purchase_id is not null),0)::int as pg_refund_qty,   -- PG 환불
  coalesce(sum(qty) filter (where entry_type='ADJUST' and purchase_id is null),0)::int      as manual_adjust_qty
from coupon_ledger
where is_admin()
group by 1;

-- 수거 활동 추이: 일별 COMPLETED 건수/final_kg 합/지급액(completed_at 기준).
-- [08 G2-③] 수단별 분리 컬럼 append(실 DDL: 20260715000001) — total_cash는 "총 지급액"(현금+포인트)로
-- 의미 확장(07까지는 전액 현금이라 동치). admin KPI는 cash_amount/point_amount를 사용.
create view v_pickup_stats_daily
  with (security_invoker = true)
as
select
  completed_at::date            as day,
  count(*)                      as completed_count,
  coalesce(sum(final_kg),0)     as total_kg,
  coalesce(sum(cash_paid_amount),0)::int as total_cash,
  coalesce(sum(cash_paid_amount) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int  as cash_amount,
  coalesce(sum(cash_paid_amount) filter (where payout_method='POINT'),0)::int                  as point_amount,
  count(*) filter (where coalesce(payout_method,'CASH')='CASH') as cash_count,
  count(*) filter (where payout_method='POINT')                 as point_count
from pickup_orders
where status='COMPLETED' and completed_at is not null and is_admin()
group by 1;

-- [08 G2-④] 라이더별 지급 실적(admin 전용, 08 P5) — 포인트 지급분은 플랫폼이 점주에게 부담(EARN)하므로
-- 라이더-플랫폼 오프라인 정산·청구의 대사 근거. 실 DDL: 20260715000001.
create view v_rider_payout_daily
  with (security_invoker = true)
as
select
  rider_id,
  completed_at::date as day,
  count(*)           as completed_count,
  coalesce(sum(final_kg),0) as total_kg,
  coalesce(sum(cash_paid_amount) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int as cash_amount,
  coalesce(sum(cash_paid_amount) filter (where payout_method='POINT'),0)::int                 as point_amount
from pickup_orders
where status='COMPLETED' and completed_at is not null and rider_id is not null and is_admin()
group by 1, 2;

-- [09 H2] 라이더별 추천 실적(security_invoker=true → referrals RLS 의존): 라이더는 본인 1행, admin은 전체.
create view v_referral_stats
  with (security_invoker = true)
as
select
  referrer_rider_id,
  count(*)::int                                                          as signed_up,
  count(*) filter (where status = 'ACTIVATED')::int                      as activated,
  coalesce(sum(supplier_bonus) filter (where status='ACTIVATED'),0)::int as supplier_bonus_paid,
  coalesce(sum(rider_reward)   filter (where status='ACTIVATED'),0)::int as rider_reward_earned
from referrals
group by referrer_rider_id;

-- [09 H2] 일별 추천 추이(admin 전용 — is_admin() 게이트 + security_invoker, 집계 뷰 선례 미러).
-- 가입은 signed_up_at, 활성화는 activated_at으로 각각 버킷팅(UNION ALL) — 활성화는 가입보다 대개 며칠 뒤라
-- "같은 날 활성화"로 세면 거의 항상 0이 된다(어드버서리얼 리뷰 확정 결함 수정).
create view v_referral_daily
  with (security_invoker = true)
as
select
  t.day,
  coalesce(sum(t.signed_up), 0)::int as signed_up,
  coalesce(sum(t.activated), 0)::int as activated
from (
  select signed_up_at::date as day, 1 as signed_up, 0 as activated from referrals
  union all
  select activated_at::date as day, 0 as signed_up, 1 as activated
  from referrals where status = 'ACTIVATED' and activated_at is not null
) t
where is_admin()
group by t.day;

-- profiles: 본인 R/W(role 변경 불가는 컬럼 권한으로), admin 전체 R
-- 성능 advisor(auth_rls_initplan): auth.uid()는 (select auth.uid())로 감싸 행마다 재평가되지 않고
-- InitPlan으로 한 번만 평가되게 한다(값 동일, 20260704000015_rls_initplan.sql에서 정렬).
create policy p_profiles_self on profiles for select using (id = (select auth.uid()) or is_admin());
create policy p_profiles_update on profiles for update using (id = (select auth.uid()));
create policy p_profiles_insert on profiles for insert with check (id = (select auth.uid()) and role <> 'admin');

-- supplier가 자신에게 배정된 라이더의 profiles/rider_profiles 행을 read (03-frontend.md U6~U9
-- "라이더 카드" 렌더용, 20260704000010_rider_card_read_policy.sql에서 추가 — p_order_rider/
-- p_events_read와 동일한 "본인이 관련된 주문의 상대방 정보 read" 패턴). pickup_orders 조회는
-- is_admin()과 동일하게 security definer 함수로 감싼다 — pickup_orders의 기존 정책
-- p_order_open_calls가 rider_profiles를 참조하므로, profiles/rider_profiles 정책 안에서
-- pickup_orders를 직접(RLS 평가 대상으로) 조회하면 rider_profiles ↔ pickup_orders 순환 참조로
-- "infinite recursion detected in policy" 에러가 난다(로컬 검증으로 재현 확인).
create or replace function fn_is_assigned_rider_of_caller(p_rider_id uuid) returns boolean as
$$ select exists (
  select 1 from pickup_orders o where o.rider_id = p_rider_id and o.supplier_id = auth.uid()
) $$
language sql security definer stable set search_path = public;

create policy p_profiles_read_assigned_rider on profiles for select using (
  fn_is_assigned_rider_of_caller(profiles.id)
);

-- [06 E8-④] rider가 자신이 배정된 주문의 supplier profiles 행을 read ([사장님께 전화] tel: 버튼용,
-- 20260709000011_profiles_read_assigned_supplier.sql에서 추가 — 위 fn_is_assigned_rider_of_caller의
-- 대칭 복제, 방향만 반대). security definer로 pickup_orders 조회를 감싸는 이유는 위와 동일(정책 순환 차단).
create or replace function fn_is_assigned_supplier_of_caller(p_supplier_id uuid) returns boolean as
$$ select exists (
  select 1 from pickup_orders o where o.supplier_id = p_supplier_id and o.rider_id = auth.uid()
) $$
language sql security definer stable set search_path = public;

create policy p_profiles_read_assigned_supplier on profiles for select using (
  fn_is_assigned_supplier_of_caller(profiles.id)
);

-- supplier/rider_profiles: 본인 R/W, admin 전체. 단 rider verify_status는 클라이언트 update 금지(컬럼 분리 함수로만)
create policy p_sup_self on supplier_profiles for all using (id = (select auth.uid()) or is_admin());
create policy p_rider_self on rider_profiles for all using (id = (select auth.uid()) or is_admin());
-- supplier가 자신에게 배정된 라이더의 rider_profiles 행을 read (차량번호/인증상태 표시용,
-- 20260704000010_rider_card_read_policy.sql). fn_is_assigned_rider_of_caller는 위 profiles
-- 정책과 공유.
create policy p_rider_profiles_read_by_supplier on rider_profiles for select using (
  fn_is_assigned_rider_of_caller(rider_profiles.id)
);

-- price_ticks: 전체 공개 read, insert는 admin만
create policy p_price_read on price_ticks for select using (true);
create policy p_price_write on price_ticks for insert with check (is_admin());

-- [07 F2] coupon_price_ticks: 전체 read, insert admin만 (price_ticks 미러)
create policy p_coupon_price_read on coupon_price_ticks for select using (true);
create policy p_coupon_price_write on coupon_price_ticks for insert with check (is_admin());
-- [07 F2] coupon_purchases: rider 본인 + admin read. insert/update는 Edge Function(service_role)만 → 정책 없음=차단.
create policy p_coupon_purchase_read on coupon_purchases for select using (rider_id = (select auth.uid()) or is_admin());
-- [07 F2] coupon_ledger: rider 본인 + admin read. insert/update 정책 없음=차단(service_role RPC만). append-only는 트리거로도 강제.
create policy p_coupon_ledger_read on coupon_ledger for select using (rider_id = (select auth.uid()) or is_admin());

-- depots: read는 인증 사용자, write는 admin
create policy p_depot_read on depots for select using ((select auth.uid()) is not null);
create policy p_depot_write on depots for all using (is_admin());

-- pickup_orders: supplier 본인 것 / 배정 rider 본인 것 / REQUESTED는 verified 라이더 콜 목록용 read / admin 전체
create policy p_order_supplier on pickup_orders for select using (supplier_id = (select auth.uid()) or is_admin());
create policy p_order_rider on pickup_orders for select using (rider_id = (select auth.uid()));
create policy p_order_open_calls on pickup_orders for select using (
  status = 'REQUESTED' and exists(
    select 1 from rider_profiles r where r.id = (select auth.uid()) and r.verify_status='APPROVED')
);
-- insert/update는 클라이언트 금지 → Edge Function(service_role)만. 정책 없음 = 차단.

-- order_events: 관련자 read only
create policy p_events_read on order_events for select using (
  is_admin() or exists(select 1 from pickup_orders o where o.id = order_id
    and (o.supplier_id = (select auth.uid()) or o.rider_id = (select auth.uid())))
);

-- point_ledger / withdrawals / notifications: 본인 read, admin 전체. 쓰기는 Edge Function만
create policy p_ledger_read on point_ledger for select using (user_id = (select auth.uid()) or is_admin());
create policy p_withdraw_read on withdrawals for select using (user_id = (select auth.uid()) or is_admin());
create policy p_noti_read on notifications for select using (user_id = (select auth.uid()));
create policy p_noti_update on notifications for update using (user_id = (select auth.uid())); -- read_at 갱신

-- [07 F12] cs_tickets: 본인 select+insert(author_id·role 위조 차단), admin 전체 select + (답변·상태만)
-- update. 원장류 아님 → 클라이언트 insert 허용. update 컬럼 제한은 GRANT(admin_reply,status,resolved_at)로.
create policy p_cs_read on cs_tickets for select using (author_id = (select auth.uid()) or is_admin());
create policy p_cs_insert on cs_tickets for insert with check (author_id = (select auth.uid()) and role = fn_current_role());
create policy p_cs_admin_update on cs_tickets for update using (is_admin()) with check (is_admin());

-- [09 H2] referrals: referrer 라이더 본인 + referred 점주 본인 + admin read. insert/update 정책 부재 = service_role RPC만.
create policy p_referral_read on referrals for select using (
  referrer_rider_id = (select auth.uid())
  or referred_supplier_id = (select auth.uid())
  or is_admin()
);

-- Storage 버킷: order-photos (관련자 read / rider write), rider-docs (본인 write, admin read)
-- Realtime publication: pickup_orders, notifications, price_ticks, rider_profiles, point_ledger, coupon_ledger, referrals 활성화
-- [07 F5] coupon_ledger 추가(20260709000006 — apps/rider 쿠폰 잔액 카드/내역이 CHARGE/CONSUME/REFUND/ADJUST insert를 폴링 없이 반영. RLS p_coupon_ledger_read 적용, 본인 행만 전달)
-- [09 H2] referrals 추가(20260715000004 — apps/rider "내 추천" 실적이 attach/activate를 폴링 없이 반영. RLS p_referral_read 적용, 본인 관련 행만 전달)
-- (price_ticks는 03-frontend.md U3 "PriceCard(최신 tick, Realtime 구독)"에 필요 — T7에서 추가.
--  rider_profiles는 apps/rider R1 "PENDING 대기 화면(Realtime으로 verify_status 변경 감지)"에
--  필요 — T9에서 추가. point_ledger는 apps/user U11 지갑·apps/rider R7/R8 정산의
--  PointBalanceCard/LedgerList가 출금 승인/반려 등을 폴링 없이 반영하는 데 필요(공통 규칙
--  "Realtime 이벤트 수신 시 해당 queryKey invalidate") — T10에서 추가. RLS(p_ledger_read)가
--  그대로 적용되어 본인 행 변경만 전달된다)

-- ===== 권한 상승/무결성 가드 (20260704000016_privilege_guards.sql, 어드버서리얼 리뷰 수정) =====
-- 일반 인증 사용자(authenticated)가 자기 profiles.role, rider_profiles.verify_status/reject_reason를
-- 셀프 변경하지 못하도록 트리거로 강제한다(insert/update 양쪽). service_role(Edge Function)과
-- postgres/supabase_admin(마이그레이션·시드)만 예외. RLS(본인 행)와 별개의 컬럼 값 무결성 계층.
create or replace function guard_profile_role() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
  new.role := old.role;  -- authenticated는 role 변경 불가(기존값 강제)
  return new;
end; $$;
create trigger trg_guard_profile_role before update on profiles
  for each row execute function guard_profile_role();

create or replace function guard_rider_verify() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role','postgres','supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    new.verify_status := 'PENDING'; new.reject_reason := null;   -- 셀프 가입은 항상 미검수
  else
    new.verify_status := old.verify_status; new.reject_reason := old.reject_reason;
  end if;
  return new;
end; $$;
create trigger trg_guard_rider_verify before insert or update on rider_profiles
  for each row execute function guard_rider_verify();

-- 라이더당 활성 주문 1건 불변식: 동시 이중수락(TOCTOU)을 DB 유니크 제약으로 차단.
create unique index idx_rider_single_active_order on pickup_orders (rider_id)
  where status in ('ACCEPTED','ARRIVED','PICKED_UP','DISPUTED');
