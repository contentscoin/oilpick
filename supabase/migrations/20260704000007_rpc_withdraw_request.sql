-- fn_request_withdraw: 출금 신청을 "잔액 확인 + WITHDRAW_REQUEST 원장 기록 + withdrawals insert"
-- 단일 트랜잭션(단일 RPC 호출)으로 원자적으로 처리한다.
--
-- 배경: docs/spec/02-api.md "7. withdraw-request (supplier/rider)":
--   "RPC 트랜잭션: v_point_balance.available >= amount 검증(행 잠금은 원장 insert 직렬화로) →
--    WITHDRAW_REQUEST(-amount) → withdrawals insert. 잔액 부족 400 INSUFFICIENT_BALANCE."
-- 이는 00-domain.md "포인트 원장 규칙"에 이미 명시된 요구사항(잔액 부족 400, 최소 출금
-- 10,000P)을 만족시키기 위한 구현 세부이며 새로운 설계 판단이 아니다(태스크 지시사항).
--
-- 왜 별도 RPC가 필요한가: v_point_balance는 point_ledger 위의 집계 뷰라서 "확인 후 잠글 행"이
-- 없다 — Edge Function에서 "SELECT 잔액 → 확인 → INSERT"를 두 단계로 나누면, 동시에 두 출금
-- 요청이 들어올 때 둘 다 잔액을 통과해 총 출금액이 잔액을 초과하는 레이스가 생길 수 있다.
-- 해결: 동일 user_id의 point_ledger 행들에 대해 FOR UPDATE로 잠근 뒤(사실상 user 단위 직렬화)
-- 잔액을 다시 계산하고, 그 안에서 확인+INSERT까지 마친다 — 같은 트랜잭션 내에서 원자적으로
-- 수행되므로 잔액이 음수가 될 수 없다(00-domain.md "포인트 원장 규칙" 요구사항 충족).
--
-- service_role(Edge Function)에서만 호출 — 클라이언트에는 EXECUTE 권한을 주지 않는다
-- (CLAUDE.md 절대 규칙 1 "포인트는 클라이언트에서 절대 쓰지 않는다").
create or replace function fn_request_withdraw(
  p_user_id uuid,
  p_amount int,
  p_bank_name text,
  p_bank_account text,
  p_bank_holder text
) returns withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available int;
  v_withdrawal withdrawals;
begin
  if p_amount < 10000 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- 동일 user_id의 point_ledger 행을 잠가 동시 출금 신청을 직렬화한다.
  -- (다른 user_id의 신청과는 서로 블로킹하지 않음 — user 단위 잠금.)
  perform 1 from point_ledger where user_id = p_user_id for update;

  select coalesce(sum(case
    when entry_type = 'HOLD' then 0
    when entry_type = 'RELEASE' then amount
    else amount end), 0)::int
  into v_available
  from point_ledger
  where user_id = p_user_id;

  if v_available < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into withdrawals (user_id, amount, status, bank_name, bank_account, bank_holder)
  values (p_user_id, p_amount, 'REQUESTED', p_bank_name, p_bank_account, p_bank_holder)
  returning * into v_withdrawal;

  perform fn_post_ledger(
    p_user_id, 'WITHDRAW_REQUEST', -p_amount, null,
    'withdraw-request', p_user_id, v_withdrawal.id
  );

  return v_withdrawal;
end;
$$;

revoke all on function fn_request_withdraw(uuid, int, text, text, text) from public;
grant execute on function fn_request_withdraw(uuid, int, text, text, text) to service_role;
