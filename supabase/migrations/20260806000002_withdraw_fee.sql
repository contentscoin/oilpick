-- [08 Q1] 출금 수수료 1,000P (CEO 2026-08-06 확정 — docs/spec/08-payout-pivot.md Q절).
--
-- ① withdrawals.fee — 신청 시점 수수료 스냅샷(시세 스냅샷 원칙의 미러: 이후 정책 변경 무영향).
-- ② fn_request_withdraw 개정 — 잔액 요건 available ≥ amount+fee,
--    WITHDRAW_REQUEST(-amount)와 별도 행 WITHDRAW_FEE(-fee)를 동일 트랜잭션 발행.
-- ③ fn_process_withdraw 개정 — REJECTED 복구를 amount+fee 전액으로(신청 불성사 시 수수료 반환).
--    WITHDRAW_CANCEL 1행(+amount+fee), withdrawal_id 멱등 가드는 기존 그대로.
-- 세무 공제(3.3%·부가세)는 admin 이체 금액 산정 기준(오프-플랫폼)이며 원장 무기록(08 Q4).

alter table withdrawals add column if not exists fee int not null default 0;

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
  v_fee constant int := 1000; -- WITHDRAW_FEE_POINT (packages/core constants와 동기)
  v_available int;
  v_withdrawal withdrawals;
begin
  if p_amount < 10000 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- 동일 user_id의 point_ledger 행을 잠가 동시 출금 신청을 직렬화한다(기존 동작 유지).
  perform 1 from point_ledger where user_id = p_user_id for update;

  select coalesce(sum(case
    when entry_type = 'HOLD' then 0
    when entry_type = 'RELEASE' then amount
    else amount end), 0)::int
  into v_available
  from point_ledger
  where user_id = p_user_id;

  -- 수수료까지 함께 차감되므로 잔액 요건은 amount+fee.
  if v_available < p_amount + v_fee then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  insert into withdrawals (user_id, amount, fee, status, bank_name, bank_account, bank_holder)
  values (p_user_id, p_amount, v_fee, 'REQUESTED', p_bank_name, p_bank_account, p_bank_holder)
  returning * into v_withdrawal;

  perform fn_post_ledger(
    p_user_id, 'WITHDRAW_REQUEST', -p_amount, null,
    'withdraw-request', p_user_id, v_withdrawal.id
  );
  perform fn_post_ledger(
    p_user_id, 'WITHDRAW_FEE', -v_fee, null,
    'withdraw-fee', p_user_id, v_withdrawal.id
  );

  return v_withdrawal;
end;
$$;

revoke all on function fn_request_withdraw(uuid, int, text, text, text) from public;
grant execute on function fn_request_withdraw(uuid, int, text, text, text) to service_role;

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

    -- WITHDRAW_CANCEL(+amount+fee) 전액 복구(08 Q1 — 수수료 포함). order_id는 null이므로
    -- unique(order_id, entry_type, user_id) 제약에 걸리지 않고 withdrawal_id로 멱등 처리한다.
    -- fee 컬럼 도입 전 신청 건은 fee=0이라 기존 복구액(+amount)과 동일하다.
    if not exists (
      select 1 from point_ledger
      where withdrawal_id = p_withdrawal_id and entry_type = 'WITHDRAW_CANCEL'
    ) then
      insert into point_ledger (user_id, entry_type, amount, order_id, withdrawal_id, memo, created_by)
      values (v_withdrawal.user_id, 'WITHDRAW_CANCEL', v_withdrawal.amount + v_withdrawal.fee, null, p_withdrawal_id, p_memo, p_admin_id);
    end if;

    return v_withdrawal;
  end if;

  raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
end;
$$;

revoke all on function fn_process_withdraw(uuid, withdraw_status, uuid, text) from public;
grant execute on function fn_process_withdraw(uuid, withdraw_status, uuid, text) to service_role;
