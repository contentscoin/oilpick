-- fn_process_withdraw: withdraw-process(admin) 전이를 단일 트랜잭션으로 처리.
--
-- 배경: docs/spec/02-api.md "8. withdraw-process (admin)":
--   "입력: { withdrawalId, decision: 'APPROVED'|'REJECTED'|'PAID', memo? }
--    REJECTED 시 WITHDRAW_CANCEL(+amount) 복구. 상태 전이: REQUESTED→APPROVED→PAID 또는
--    REQUESTED→REJECTED."
-- fn_transition_order와 동일한 이유로 상태 전이+원장 복구를 단일 RPC 트랜잭션으로 묶는다
-- (02-api.md 공통 규칙 "상태 전이+원장 기록은 단일 Postgres 함수 호출로 트랜잭션 보장").
--
-- service_role(Edge Function)에서만 호출.
create or replace function fn_process_withdraw(
  p_withdrawal_id uuid,
  p_decision withdraw_status,
  p_admin_id uuid,
  p_memo text default null
) returns withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal withdrawals;
begin
  select * into v_withdrawal from withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_decision = 'APPROVED' then
    if v_withdrawal.status <> 'REQUESTED' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    update withdrawals
    set status = 'APPROVED', admin_memo = p_memo, processed_by = p_admin_id, processed_at = now()
    where id = p_withdrawal_id
    returning * into v_withdrawal;

    return v_withdrawal;
  end if;

  if p_decision = 'PAID' then
    if v_withdrawal.status <> 'APPROVED' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    update withdrawals
    set status = 'PAID', admin_memo = coalesce(p_memo, admin_memo), processed_by = p_admin_id, processed_at = now()
    where id = p_withdrawal_id
    returning * into v_withdrawal;

    return v_withdrawal;
  end if;

  if p_decision = 'REJECTED' then
    if v_withdrawal.status <> 'REQUESTED' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    update withdrawals
    set status = 'REJECTED', admin_memo = p_memo, processed_by = p_admin_id, processed_at = now()
    where id = p_withdrawal_id
    returning * into v_withdrawal;

    -- WITHDRAW_CANCEL(+amount) 복구. order_id는 null이므로 unique(order_id, entry_type, user_id)
    -- 제약에 걸리지 않고(NULL은 서로 distinct) withdrawal_id로 멱등 처리한다.
    if not exists (
      select 1 from point_ledger
      where withdrawal_id = p_withdrawal_id and entry_type = 'WITHDRAW_CANCEL'
    ) then
      insert into point_ledger (user_id, entry_type, amount, order_id, withdrawal_id, memo, created_by)
      values (v_withdrawal.user_id, 'WITHDRAW_CANCEL', v_withdrawal.amount, null, p_withdrawal_id, p_memo, p_admin_id);
    end if;

    return v_withdrawal;
  end if;

  raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
end;
$$;

revoke all on function fn_process_withdraw(uuid, withdraw_status, uuid, text) from public;
grant execute on function fn_process_withdraw(uuid, withdraw_status, uuid, text) to service_role;
