-- pgTAP: [08 Q1] 출금 수수료 1,000P — fn_request_withdraw/fn_process_withdraw 개정 불변식.
-- ① 신청 시 WITHDRAW_REQUEST(-amount)와 별도 행 WITHDRAW_FEE(-1,000)가 발행되고 잔액 = -amount-fee.
-- ② withdrawals.fee에 신청 시점 수수료가 스냅샷된다.
-- ③ 잔액 요건은 amount+fee — amount만 충족하고 fee가 모자라면 INSUFFICIENT_BALANCE.
-- ④ 반려(REJECTED) 시 WITHDRAW_CANCEL(+amount+fee) 전액 복구 → 잔액 원복. 재반려 멱등.
-- supabase test db 로 실행(각 파일은 트랜잭션 후 롤백).
create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- ── 픽스처 ──────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('31111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfee-sup@t.local',now(),now()),
  ('32222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wfee-admin@t.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('31111111-1111-1111-1111-111111111111','supplier','010','수수료점주'),
  ('32222222-2222-2222-2222-222222222222','admin','012','관리자');

-- 잔액 30,000P 적립(ADJUST — service_role 경로 시뮬레이션).
select fn_post_ledger('31111111-1111-1111-1111-111111111111','ADJUST',30000,null,'테스트 적립','32222222-2222-2222-2222-222222222222',null);
select is((select available from v_point_balance where user_id='31111111-1111-1111-1111-111111111111'), 30000, '픽스처: 잔액 30,000P');

-- ── ① 신청: -amount-fee + ② fee 스냅샷 ─────────────────────────────────
select fn_request_withdraw('31111111-1111-1111-1111-111111111111',10000,'은행','110-123','홍길동');
select is((select available from v_point_balance where user_id='31111111-1111-1111-1111-111111111111'), 19000, '신청 후 잔액 = 30,000 - 10,000 - 1,000(수수료) = 19,000');
select is((select fee from withdrawals where user_id='31111111-1111-1111-1111-111111111111' order by created_at desc limit 1), 1000, 'withdrawals.fee = 1,000 스냅샷');
select is((select count(*)::int from point_ledger where user_id='31111111-1111-1111-1111-111111111111' and entry_type='WITHDRAW_FEE'), 1, 'WITHDRAW_FEE 1행');
select is((select amount from point_ledger where user_id='31111111-1111-1111-1111-111111111111' and entry_type='WITHDRAW_FEE'), -1000, 'WITHDRAW_FEE = -1,000');

-- ── ③ 잔액 요건 amount+fee — 잔액 19,000에서 19,000 신청은 수수료가 모자라 거부 ──
select throws_ok(
  $q$select fn_request_withdraw('31111111-1111-1111-1111-111111111111',19000,'은행','110-123','홍길동')$q$,
  'INSUFFICIENT_BALANCE',
  '잔액 19,000에서 19,000 신청 → 수수료 1,000 부족으로 거부'
);
-- 18,000 신청(18,000+1,000=19,000 정확히 충족)은 성공.
select fn_request_withdraw('31111111-1111-1111-1111-111111111111',18000,'은행','110-123','홍길동');
select is((select available from v_point_balance where user_id='31111111-1111-1111-1111-111111111111'), 0, '경계값: 18,000+1,000 신청 후 잔액 0');

-- ── ④ 반려 → amount+fee 전액 복구 + 멱등 ────────────────────────────────
select fn_process_withdraw(
  (select id from withdrawals where user_id='31111111-1111-1111-1111-111111111111' and amount=18000),
  'REJECTED','32222222-2222-2222-2222-222222222222','계좌 불일치');
select is((select available from v_point_balance where user_id='31111111-1111-1111-1111-111111111111'), 19000, '반려 후 잔액 = 18,000+1,000 전액 복구 → 19,000');
select is((select amount from point_ledger where withdrawal_id=(select id from withdrawals where user_id='31111111-1111-1111-1111-111111111111' and amount=18000) and entry_type='WITHDRAW_CANCEL'), 19000, 'WITHDRAW_CANCEL = +19,000(amount+fee)');
-- 같은 건 재반려 시도 → INVALID_TRANSITION(이미 REJECTED)이고 원장 추가 없음(멱등 가드는 상태 가드가 선행).
select throws_ok(
  $q$select fn_process_withdraw(
    (select id from withdrawals where user_id='31111111-1111-1111-1111-111111111111' and amount=18000),
    'REJECTED','32222222-2222-2222-2222-222222222222','재시도')$q$,
  'INVALID_TRANSITION',
  '재반려는 상태 가드로 거부'
);
select is((select count(*)::int from point_ledger where withdrawal_id=(select id from withdrawals where user_id='31111111-1111-1111-1111-111111111111' and amount=18000) and entry_type='WITHDRAW_CANCEL'), 1, 'WITHDRAW_CANCEL 1행 유지(멱등)');

select * from finish();
rollback;
