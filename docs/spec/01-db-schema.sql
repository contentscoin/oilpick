-- OilPick DB Schema v1 (단일 진실 — 마이그레이션 작성 시 이 파일 기준)
-- Postgres 15 + PostGIS. Supabase auth.users를 FK 기준으로 사용.

create extension if not exists postgis;

-- ===== enums =====
create type user_role as enum ('supplier','rider','admin');
create type order_status as enum ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP','DELIVERED','COMPLETED','CANCELLED','DISPUTED');
create type ledger_type as enum ('EARN','HOLD','RELEASE','WITHDRAW_REQUEST','WITHDRAW_CANCEL','ADJUST','PURCHASE');
create type verify_status as enum ('PENDING','APPROVED','REJECTED');
create type withdraw_status as enum ('REQUESTED','APPROVED','REJECTED','PAID');

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
  created_at timestamptz not null default now()
);
create index idx_rider_location on rider_profiles using gist(last_location);

-- ===== 시세 =====
create table price_ticks (
  id bigint generated always as identity primary key,
  price_per_kg int not null check (price_per_kg > 0),   -- 원/kg
  rider_fee int not null check (rider_fee > 0),          -- 기본 수거비 P
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
  snapshot_rider_fee int not null,
  -- 확정 정보
  measured_kg numeric(8,1),                 -- 라이더 계량
  final_kg numeric(8,1),                    -- 확정(중재 반영) — EARN 계산 기준
  supplier_point int,                       -- 지급된 EARN
  photo_urls text[] not null default '{}',
  cancel_reason text,
  dispute_reason text,
  broadcast_radius_km int not null default 3,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, picked_up_at timestamptz, delivered_at timestamptz
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

-- security definer 함수는 search_path를 고정해 하이재킹을 막는다(Supabase security advisor 대응).
create or replace function is_admin() returns boolean as
$$ select exists(select 1 from profiles where id = auth.uid() and role='admin') $$
language sql security definer stable set search_path = public;

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

-- Storage 버킷: order-photos (관련자 read / rider write), rider-docs (본인 write, admin read)
-- Realtime publication: pickup_orders, notifications, price_ticks, rider_profiles, point_ledger 활성화
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
