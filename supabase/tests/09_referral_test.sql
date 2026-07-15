-- pgTAP: 09 라이더 추천(레퍼럴) 불변식 (docs/spec/09-referral.md §안티어뷰즈·§1).
--   - attach: APPROVED 라이더 코드만 유효, 미승인/오코드 거부, 점주 1인 1회(멱등), 자기추천 방어.
--   - activate: SIGNED_UP→ACTIVATED + REFERRAL 발행, 이미 활성/추천없음 no-op, 발행 멱등.
--   - 통계 뷰 집계.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(17);

-- ── 픽스처: 라이더 2(승인/미승인) + 점주 2 ──────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('99000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsup1@t',now(),now()),
  ('99000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rsup2@t',now(),now()),
  ('99000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rrid1@t',now(),now()),
  ('99000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rrid2@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('99000000-0000-0000-0000-0000000000a1','supplier','010','점주1'),
  ('99000000-0000-0000-0000-0000000000a2','supplier','011','점주2'),
  ('99000000-0000-0000-0000-0000000000b1','rider','012','라이더승인'),
  ('99000000-0000-0000-0000-0000000000b2','rider','013','라이더미승인');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('99000000-0000-0000-0000-0000000000a1','b','s1','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography),
  ('99000000-0000-0000-0000-0000000000a2','b','s2','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, referral_code) values
  ('99000000-0000-0000-0000-0000000000b1','b','01가1','APPROVED','ABCD2345'),
  ('99000000-0000-0000-0000-0000000000b2','b','02나2','PENDING','WXYZ6789')
  on conflict (id) do nothing;

-- ============ attach 검증 ============
-- 1) 오코드 → INVALID_REFERRAL_CODE
select throws_ok(
  $$ select fn_attach_referral('99000000-0000-0000-0000-0000000000a1','NOPE0000',5000,3000) $$,
  'INVALID_REFERRAL_CODE', '존재하지 않는 코드는 거부');

-- 2) 미승인(PENDING) 라이더 코드 → 거부
select throws_ok(
  $$ select fn_attach_referral('99000000-0000-0000-0000-0000000000a1','WXYZ6789',5000,3000) $$,
  'INVALID_REFERRAL_CODE', 'PENDING 라이더 코드는 거부');

-- 3) 정상 attach(소문자·공백 정규화 포함) → SIGNED_UP
select fn_attach_referral('99000000-0000-0000-0000-0000000000a1','  abcd2345  ',5000,3000);
select is((select status::text from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  'SIGNED_UP', 'attach → SIGNED_UP');
select is((select referrer_rider_id from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  '99000000-0000-0000-0000-0000000000b1'::uuid, '추천자 = 코드 소유 라이더(정규화 매칭)');
select is((select supplier_bonus from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  5000, '점주 보너스 스냅샷 5000');
select is((select rider_reward from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  3000, '라이더 보상 스냅샷 3000');

-- 4) 재-attach(다른 금액/코드) → 기존 행 유지(멱등, 점주 1인 1회)
select fn_attach_referral('99000000-0000-0000-0000-0000000000a1','ABCD2345',9999,9999);
select is((select count(*)::int from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  1, '재-attach 멱등: 1행 유지');
select is((select supplier_bonus from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  5000, '재-attach는 기존 스냅샷 유지(9999 무시)');

-- ============ activate 검증 ============
-- 활성화 유발 주문(점주1의 완료 주문). 실제 상태머신 대신 직삽입(REFERRAL 발행 로직만 검증).
insert into pickup_orders (id, supplier_id, rider_id, status, requested_kg, pickup_address, pickup_location,
  snapshot_price_per_kg, measured_kg, final_kg, payout_method, cash_paid_amount, completed_at) values
  ('99000000-0000-0000-0000-0000000000e1','99000000-0000-0000-0000-0000000000a1','99000000-0000-0000-0000-0000000000b1',
   'COMPLETED',20.0,'a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700,20.0,20.0,'CASH',14000, now());

-- 5) 활성화 → ACTIVATED + REFERRAL 5000 발행
select fn_activate_referral('99000000-0000-0000-0000-0000000000a1','99000000-0000-0000-0000-0000000000e1');
select is((select status::text from referrals where referred_supplier_id='99000000-0000-0000-0000-0000000000a1'),
  'ACTIVATED', 'activate → ACTIVATED');
select is((select count(*)::int from point_ledger where user_id='99000000-0000-0000-0000-0000000000a1' and entry_type='REFERRAL'),
  1, 'REFERRAL 원장 1행 발행');
select is((select amount from point_ledger where user_id='99000000-0000-0000-0000-0000000000a1' and entry_type='REFERRAL'),
  5000, 'REFERRAL 금액 = supplier_bonus 스냅샷');
select is((select available from v_point_balance where user_id='99000000-0000-0000-0000-0000000000a1'),
  5000, '추천 보너스가 available에 반영(출금 가능)');

-- 6) 재활성화 → no-op(멱등): 상태 불변, REFERRAL 1행 유지
select fn_activate_referral('99000000-0000-0000-0000-0000000000a1','99000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from point_ledger where user_id='99000000-0000-0000-0000-0000000000a1' and entry_type='REFERRAL'),
  1, '재활성화 멱등: REFERRAL 1행 유지');

-- 7) 추천 없는 점주 활성화 → no-op(예외 없음)
select lives_ok(
  $$ select fn_activate_referral('99000000-0000-0000-0000-0000000000a2','99000000-0000-0000-0000-0000000000e1') $$,
  '추천 없는 점주 activate는 no-op(예외 없음)');

-- ============ 통계 뷰 ============
select is((select signed_up from v_referral_stats where referrer_rider_id='99000000-0000-0000-0000-0000000000b1'),
  1, 'v_referral_stats: 라이더1 가입 1');
select is((select activated from v_referral_stats where referrer_rider_id='99000000-0000-0000-0000-0000000000b1'),
  1, 'v_referral_stats: 라이더1 활성 1');
select is((select rider_reward_earned from v_referral_stats where referrer_rider_id='99000000-0000-0000-0000-0000000000b1'),
  3000, 'v_referral_stats: 활성 보상 합 3000');

select * from finish();
rollback;
