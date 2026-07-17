-- 04-tasks.md T3: admin 계정, 집하장 1개(레거시), 초기 price_tick 1건.
-- 08 G8: 현장 지급수단 신모델 데모 시드 — 데모 공급자 1 + 데모 라이더 2, 열린 콜 1건(coupon_cost null),
--   POINT 지급 완료 주문 1건(+EARN 원장) + 출금 신청 1건(WITHDRAW_REQUEST) — 지갑/출금 큐 데모용.
--   (07 쿠폰 시드 — 단가 tick·ADJUST 선충전 — 는 쿠폰 모델 폐기로 제거.)
-- 로컬 개발/시뮬레이션 전용 시드. auth.users에 먼저 admin용 유저를 만든 뒤 profiles를 연결한다.
--
-- (T11 admin 로그인 E2E 검증 중 발견한 버그 수정) information_schema.columns로 실측한 결과
-- auth.users의 confirmation_token/recovery_token/email_change_token_new/email_change
-- 4개 character varying 컬럼은 기본값이 없다(phone_change/phone_change_token/
-- email_change_token_current/reauthentication_token 등 나머지 token류 컬럼은
-- ''::character varying 기본값을 가짐 — 이 4개만 예외). 이 insert가 해당 컬럼을 명시하지
-- 않으면 NULL로 저장되는데, GoTrue(v2.192.0)의 signInWithPassword가 auth.users를 Go
-- string 필드로 스캔하면서 NULL을 만나면 "converting NULL to string is unsupported" 500
-- 에러로 로그인 자체가 실패한다 — 실제 admin 로그인 시도 2회(각각 confirmation_token류,
-- email_change 컬럼에서)로 재현하고 docker logs supabase_auth_oilpick으로 원인을 특정했다
-- (태스크 브리핑에 "GoTrue 시드 계정의 NULL 토큰 컬럼 이슈가 이미 발견돼 있으니"라고 언급된
-- 바로 그 문제). 새로운 설계 판단이 아니라 이미 명시된 admin 시드 계정이 실제로 로그인
-- 가능해야 한다는 기존 요구(T3 DoD, 03-frontend.md "admin 로그인")를 만족시키기 위한 버그
-- 수정이라 판단해 4개 컬럼 모두 빈 문자열로 명시했다.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@oilpick.local',
  crypt('oilpick-admin-seed', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  '', '', '', ''
) on conflict (id) do nothing;

insert into profiles (id, role, phone, display_name)
values ('00000000-0000-0000-0000-000000000001', 'admin', '010-0000-0000', 'OilPick 관리자')
on conflict (id) do nothing;

-- ===== 집하장 1개 =====
insert into depots (id, name, address, location, is_active)
values (
  '00000000-0000-0000-0000-0000000000d1',
  'OilPick 서울 집하장',
  '서울특별시 강서구 오일픽로 1',
  st_point(126.8225, 37.5509)::geography,
  true
) on conflict (id) do nothing;

-- ===== 초기 price_tick 1건 (레거시 tick — rider_fee는 07 F3b-④에서 신규 미기록, 기존값 보존) =====
insert into price_ticks (price_per_kg, rider_fee, created_by)
values (700, 5000, '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ============================================================================
-- 08 신모델(현장 지급수단) 데모 시드
-- ============================================================================

-- ===== 데모 공급자(점주) 1 + 데모 라이더 2 =====
-- auth.users는 admin과 동일하게 GoTrue NULL 토큰 컬럼 이슈(위 주석 참조) 회피를 위해
-- confirmation_token/recovery_token/email_change_token_new/email_change를 빈 문자열로 명시한다.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'demo-supplier@oilpick.local',
   crypt('oilpick-demo-seed', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'demo-rider1@oilpick.local',
   crypt('oilpick-demo-seed', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'demo-rider2@oilpick.local',
   crypt('oilpick-demo-seed', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;

insert into profiles (id, role, phone, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'supplier', '010-1000-0001', '데모 기름집'),
  ('00000000-0000-0000-0000-0000000000b1', 'rider', '010-2000-0001', '데모 라이더1'),
  ('00000000-0000-0000-0000-0000000000b2', 'rider', '010-2000-0002', '데모 라이더2')
on conflict (id) do nothing;

insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('00000000-0000-0000-0000-0000000000a1', '000-00-00001', '데모 기름집',
   '서울특별시 강서구 오일픽로 10', st_point(126.8300, 37.5520)::geography)
on conflict (id) do nothing;

-- 라이더는 신모델 게이트(콜 수락) 통과를 위해 APPROVED로 시드.
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online) values
  ('00000000-0000-0000-0000-0000000000b1', '000-00-00011', '01가1001', 'APPROVED', true),
  ('00000000-0000-0000-0000-0000000000b2', '000-00-00012', '02나2002', 'APPROVED', false)
on conflict (id) do nothing;

-- ===== 열린 콜 1건 (08 신모델 — coupon_cost 스냅샷 중지, null) =====
-- REQUESTED: requested_kg 30(18L 말통 2개). 라이더 미배정. 쿠폰 게이트 없음(08 P1).
insert into pickup_orders (
  id, supplier_id, status, requested_cans, requested_kg,
  pickup_address, pickup_location, preferred_time,
  snapshot_price_per_kg
) values (
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000a1', 'REQUESTED', 2, 30.0,
  '서울특별시 강서구 오일픽로 10', st_point(126.8300, 37.5520)::geography, '지금',
  700
) on conflict (id) do nothing;

-- ===== POINT 지급 완료 주문 1건 + EARN 원장 (08 P2·P3 데모 — 지갑/실적 화면용) =====
-- 데모 라이더1이 30kg 계량·포인트 지급 → 점주 확인 완료. 확정 지급액 = round(30×700) = 21,000P.
-- 시드는 postgres로 실행되어 RLS를 우회하며, point_ledger insert는 append-only 트리거(UPDATE/DELETE만
-- 차단)에 걸리지 않는다. 멱등: 주문 on conflict(id) + EARN unique(order_id, entry_type, user_id).
insert into pickup_orders (
  id, supplier_id, rider_id, status, requested_cans, requested_kg,
  pickup_address, pickup_location, preferred_time,
  snapshot_price_per_kg, measured_kg, final_kg, payout_method, cash_paid_amount,
  photo_urls, accepted_at, completed_at
) values (
  '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
  'COMPLETED', 2, 30.0,
  '서울특별시 강서구 오일픽로 10', st_point(126.8300, 37.5520)::geography, '지금',
  700, 30.0, 30.0, 'POINT', 21000,
  array['https://placehold.co/600x400?text=oil'], now() - interval '1 day', now() - interval '1 day'
) on conflict (id) do nothing;

insert into point_ledger (user_id, entry_type, amount, order_id, memo)
values ('00000000-0000-0000-0000-0000000000a1', 'EARN', 21000,
        '00000000-0000-0000-0000-0000000000e2', 'CONFIRM_MEASURE(데모)')
on conflict (order_id, entry_type, user_id) do nothing;

-- ===== 출금 신청 1건 (08 P4 데모 — admin 출금 큐/지갑 내역용) =====
-- 10,000P 신청 → WITHDRAW_REQUEST(-10000). 잔여 available = 11,000P.
-- 멱등: 고정 id on conflict + 원장은 withdrawal_id 존재 확인.
insert into withdrawals (id, user_id, amount, status, bank_name, bank_account, bank_holder)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
        10000, 'REQUESTED', '국민은행', '000000-00-000000', '데모 기름집')
on conflict (id) do nothing;

insert into point_ledger (user_id, entry_type, amount, withdrawal_id, memo)
select '00000000-0000-0000-0000-0000000000a1', 'WITHDRAW_REQUEST', -10000,
       '00000000-0000-0000-0000-0000000000f1', 'withdraw-request(데모)'
where not exists (
  select 1 from point_ledger
  where withdrawal_id = '00000000-0000-0000-0000-0000000000f1' and entry_type = 'WITHDRAW_REQUEST'
);
