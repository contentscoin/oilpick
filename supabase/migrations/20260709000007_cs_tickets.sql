-- [07 F12] CS 1차 — 문의 티켓.
--
-- 고객센터 문의를 담는 테이블. 원장류(point_ledger/coupon_ledger)가 아니라 단순 문의 레코드이므로
-- 무결성 리스크가 없어 클라이언트 insert를 허용한다(07 F12 ① 명시). 단, 위조 방지를 위해
--   ① author_id = 로그인 사용자(auth.uid()) 강제
--   ② role = 작성자 본인 profiles.role 과 일치 강제
-- 를 RLS with check로 건다. admin은 전체 select + (답변·상태만) update 한다.
--
-- CASH_DISPUTE = 현금 지급 후 분쟁 전용 수용처(07 §1-3 — 상태머신 밖. 라이더 "확인 안 해줘요" /
-- 점주 "돈 못 받았어요"). COUPON_PAYMENT = 쿠폰 결제/환불 문의(→ admin이 SettlementPage 환불로 연결).
--
-- 무결성/관례 패턴은 기존 선례를 미러링한다:
--   - is_admin() 게이트: 20260704000001_init.sql:185
--   - security definer + search_path 고정: 20260704000010(fn_is_assigned_rider_of_caller)/000014
--   - (select auth.uid()) initplan 최적화: 20260704000015_rls_initplan.sql
--   - GRANT 관례: 20260704000005_grants.sql / 20260709000002_coupon_schema.sql
-- 이 파일은 01-db-schema.sql의 [07 F12] 예약 마커 블록을 실 DDL로 대체한다.

-- ===== enums =====
create type cs_category as enum ('ORDER','CASH_DISPUTE','COUPON_PAYMENT','ACCOUNT','ETC');
create type cs_status as enum ('OPEN','IN_PROGRESS','RESOLVED');

-- ===== 문의 티켓 =====
create table cs_tickets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  role user_role not null,                                -- 작성자 역할 스냅샷(본인 profiles.role과 일치 강제)
  category cs_category not null,
  order_id uuid references pickup_orders(id),             -- 연결 주문(선택). ORDER/CASH_DISPUTE 문의 시 첨부.
  title text not null,
  body text not null,
  status cs_status not null default 'OPEN',
  admin_reply text,                                       -- admin 답변(답변 전 null)
  created_at timestamptz not null default now(),
  resolved_at timestamptz                                 -- RESOLVED 전이 시각
);
create index idx_cs_tickets_status on cs_tickets (status, created_at desc);
create index idx_cs_tickets_author on cs_tickets (author_id, created_at desc);

-- 작성자 역할 조회 helper — insert with check에서 role 위조를 막는다. is_admin()과 동일하게
-- security definer + search_path 고정(profiles RLS와 무관하게 값이 안정적으로 나오게).
create or replace function fn_current_role() returns user_role as
$$ select role from profiles where id = auth.uid() $$
language sql security definer stable set search_path = public;

-- ===== RLS =====
alter table cs_tickets enable row level security;

-- 본인 티켓 + admin 전체 read.
create policy p_cs_read on cs_tickets for select using (
  author_id = (select auth.uid()) or is_admin()
);
-- 본인 insert만: author_id 강제 + role은 본인 profiles.role과 일치(위조 차단).
create policy p_cs_insert on cs_tickets for insert with check (
  author_id = (select auth.uid()) and role = fn_current_role()
);
-- admin update: 정책은 전체 행을 허용하되, 실제 변경 가능한 컬럼은 아래 컬럼 GRANT로
-- admin_reply/status/resolved_at 로 제한한다(07 F12 "답변·상태만").
create policy p_cs_admin_update on cs_tickets for update using (is_admin()) with check (is_admin());

-- ===== GRANT (20260704000005 / 20260709000002 관례 미러) =====
-- service_role: cs-reply Edge Function이 답변+알림을 원자 처리(RLS/컬럼 GRANT 우회).
grant select, insert, update, delete on cs_tickets to service_role;

-- authenticated: 본인 select/insert 정책 존재 → select/insert. update는 컬럼 제한(답변·상태만).
grant select, insert on cs_tickets to authenticated;
grant update (admin_reply, status, resolved_at) on cs_tickets to authenticated;

-- anon: 인증 전 조회 시도만 허용하고 RLS(본인/admin)가 걸러낸다(000005 관례).
grant select on cs_tickets to anon;
