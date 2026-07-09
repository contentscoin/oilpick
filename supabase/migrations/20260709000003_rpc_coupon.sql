-- [07 F3a-①] 쿠폰 원장 RPC 2종: fn_charge_coupon / fn_consume_coupon.
--
-- 절대 규칙 1의 확장(07 §1-1): coupon_ledger insert는 이 두 service_role RPC에만 존재한다.
-- 잔액은 v_coupon_balance 뷰로만 조회하고, 잔액 음수 방지는 CHECK로 불가(누적합)하므로
-- rider 단위 FOR UPDATE 직렬화 후 재계산으로 방어한다(fn_request_withdraw:38-40의 검증된 패턴).
-- 멱등은 fn_post_ledger(20260704000003:32-47)의 "on conflict do nothing + 재조회" 패턴을 미러링한다.
--
-- 직렬화 잠금 대상: coupon_ledger에는 "rider의 잔액 행"이 따로 없어(원장 누적합), point_ledger를
-- user_id로 잠그는 fn_request_withdraw(20260704000007:40)를 그대로 미러해 rider의 원장 행들을
-- FOR UPDATE로 잠근다. 잔액을 감소시키는 연산(CONSUME/음수 ADJUST)은 항상 선행 CHARGE(양수 잔액)를
-- 전제하므로 잠글 행이 최소 1개 존재한다 → 첫 충전 전 0행 케이스는 잔액 부족으로 거부(insert 없음)돼
-- advisory lock 없이도 오버스펜드가 발생하지 않는다(잔액을 늘리는 CHARGE는 동시 실행돼도 안전).

-- =========================================================================
-- fn_charge_coupon: purchase_id 유무로 CHARGE(구매 충전, +qty)와 ADJUST(admin 수동 ±qty)를 구분.
--   - purchase_id not null → CHARGE(+qty, unit_price 스냅샷 필수). 멱등: unique(purchase_id, entry_type).
--   - purchase_id null     → ADJUST(±qty). 음수 시 rider FOR UPDATE 직렬화 후 잔액 부족 방어.
-- 주의(F4 경계): PG 환불의 "ADJUST(-qty, purchase_id 필수)"(07 §1-4)는 이 함수로 기록할 수 없다
--   — purchase_id가 있으면 CHARGE로 라우팅되기 때문. F4 coupon-refund는 별도 경로가 필요하다.
-- =========================================================================
create or replace function fn_charge_coupon(
  p_rider_id uuid,
  p_qty int,
  p_unit_price int default null,
  p_purchase_id uuid default null,
  p_memo text default null,
  p_created_by uuid default null
) returns coupon_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row coupon_ledger;
  v_balance int;
begin
  if p_qty = 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- ── CHARGE (구매 충전) ────────────────────────────────────────────────
  if p_purchase_id is not null then
    if p_qty <= 0 or coalesce(p_unit_price, 0) <= 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    -- 부분 유니크 인덱스(idx_coupon_ledger_purchase, where purchase_id is not null)를 arbiter로
    -- 추론하려면 ON CONFLICT에 동일 predicate를 명시해야 한다.
    insert into coupon_ledger (rider_id, entry_type, qty, unit_price, purchase_id, memo, created_by)
    values (p_rider_id, 'CHARGE', p_qty, p_unit_price, p_purchase_id, p_memo, p_created_by)
    on conflict (purchase_id, entry_type) where purchase_id is not null do nothing
    returning * into v_row;

    if v_row.id is null then
      -- 이미 충전됨(재시도) → 기존 행 조회해서 조용히 반환(멱등, purchase_id unique).
      select * into v_row from coupon_ledger
      where purchase_id = p_purchase_id and entry_type = 'CHARGE';
    end if;

    return v_row;
  end if;

  -- ── ADJUST (admin 수동 조정, purchase_id null) ─────────────────────────
  -- 음수 조정은 잔액을 초과할 수 없다 → rider 원장 행을 잠그고 재계산 후 검증.
  perform 1 from coupon_ledger where rider_id = p_rider_id for update;

  select coalesce(sum(qty), 0)::int into v_balance from coupon_ledger where rider_id = p_rider_id;
  if v_balance + p_qty < 0 then
    raise exception 'INSUFFICIENT_COUPON' using errcode = 'P0001';
  end if;

  -- ADJUST는 order_id/purchase_id가 모두 null이라 멱등 unique 2종의 적용 대상이 아니다
  -- (다중 수동 조정 허용 — 의도된 동작, 07 §1-1 ②).
  insert into coupon_ledger (rider_id, entry_type, qty, memo, created_by)
  values (p_rider_id, 'ADJUST', p_qty, p_memo, p_created_by)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function fn_charge_coupon(uuid, int, int, uuid, text, uuid) from public;
grant execute on function fn_charge_coupon(uuid, int, int, uuid, text, uuid) to service_role;

-- =========================================================================
-- fn_consume_coupon: 콜 배정 시 쿠폰 소진(-qty). rider 단위 FOR UPDATE 직렬화 → 잔액 재계산 →
--   부족 시 raise 'INSUFFICIENT_COUPON'. unique(order_id,'CONSUME',rider_id) 충돌 시 멱등.
-- fn_transition_order의 ACCEPT 분기에서 coupon_cost not null일 때만 호출된다(07 §1-3).
-- =========================================================================
create or replace function fn_consume_coupon(
  p_rider_id uuid,
  p_order_id uuid,
  p_qty int
) returns coupon_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row coupon_ledger;
  v_balance int;
begin
  if p_qty <= 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- rider 단위 직렬화(fn_request_withdraw:40 미러). 동시 수락 오버스펜드 방어의 유일한 진실.
  perform 1 from coupon_ledger where rider_id = p_rider_id for update;

  -- 멱등 선체크: 이미 이 주문에 CONSUME이 있으면(ACCEPT 재시도) 잔액 검사 없이 기존 행 반환.
  -- 잔액이 정확히 0인 재시도가 INSUFFICIENT_COUPON로 오판되는 것을 막는다.
  select * into v_row from coupon_ledger
  where order_id = p_order_id and entry_type = 'CONSUME' and rider_id = p_rider_id;
  if found then
    return v_row;
  end if;

  select coalesce(sum(qty), 0)::int into v_balance from coupon_ledger where rider_id = p_rider_id;
  if v_balance < p_qty then
    raise exception 'INSUFFICIENT_COUPON' using errcode = 'P0001';
  end if;

  insert into coupon_ledger (rider_id, entry_type, qty, order_id)
  values (p_rider_id, 'CONSUME', -p_qty, p_order_id)
  on conflict (order_id, entry_type, rider_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- 동시 삽입이 이겼다 → 기존 행 재조회(멱등).
    select * into v_row from coupon_ledger
    where order_id = p_order_id and entry_type = 'CONSUME' and rider_id = p_rider_id;
  end if;

  return v_row;
end;
$$;

revoke all on function fn_consume_coupon(uuid, uuid, int) from public;
grant execute on function fn_consume_coupon(uuid, uuid, int) to service_role;
