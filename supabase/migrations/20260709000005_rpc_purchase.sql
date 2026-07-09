-- [07 F4] PG 결제(토스페이먼츠) 확정·환불 RPC 2종: fn_confirm_purchase / fn_refund_purchase.
--
-- 절대 규칙 1의 확장(07 §1-1): coupon_ledger insert는 service_role RPC에만 존재한다.
-- F3a의 fn_charge_coupon/fn_consume_coupon에 이어 F4가 두 개를 더한다.
--
-- 왜 별도 RPC인가(F3a 보고 경계):
--   - fn_charge_coupon은 purchase_id 유무로 CHARGE/ADJUST를 라우팅한다 → purchase_id가 있으면
--     항상 CHARGE로 간다. 따라서 "PG 환불 = ADJUST(-qty, purchase_id 필수)"(07 §1-4)를
--     fn_charge_coupon으로는 기록할 수 없다. fn_refund_purchase가 그 전용 경로다.
--   - confirm은 "coupon_purchases 상태 전이(PENDING→PAID) + payment_key 기록 + CHARGE 원장"을
--     한 트랜잭션에서 원자 처리해야 한다(02-api 공통 규칙 — Edge에서 다건 쿼리로 쪼개지 말 것).
--     토스 승인 API 호출은 RPC 밖(Edge)에서 하고, 성공 후 이 RPC로 확정한다.
--
-- 멱등·직렬화 관례는 F3a(20260709000003)를 그대로 미러링한다:
--   - 상태 전이는 coupon_purchases FOR UPDATE로 직렬화하고 status로 멱등을 판정한다.
--   - 잔액을 줄이는 연산(환불 ADJUST 음수)은 rider 원장 FOR UPDATE 직렬화 후 재계산으로 방어한다
--     (fn_request_withdraw:40 / fn_consume_coupon 패턴 — 동시 수락과의 경합 방지).

-- =========================================================================
-- fn_confirm_purchase: 토스 승인 성공 후 구매 확정(원자 트랜잭션).
--   coupon_purchases FOR UPDATE → status 판정:
--     - PAID(재시도/orphan 재호출)  → 기존 CHARGE 원장 반환(멱등, 이중 충전 없음).
--     - PENDING                    → PAID·payment_key·paid_at 기록 + fn_charge_coupon(CHARGE).
--     - 그 외(FAILED/EXPIRED/REFUNDED) → 확정 불가(INVALID_TRANSITION).
--   멱등 3중(07 §1-4): 상태 전이(FOR UPDATE) + payment_key unique + coupon_ledger unique(purchase_id,'CHARGE').
--   금액(amount) 재검증은 RPC 밖 Edge가 담당(토스 응답 totalAmount == coupon_purchases.amount).
-- =========================================================================
create or replace function fn_confirm_purchase(
  p_purchase_id uuid,
  p_payment_key text
) returns coupon_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase coupon_purchases;
  v_row coupon_ledger;
begin
  if p_payment_key is null or length(trim(p_payment_key)) = 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- 구매 건 직렬화(동시 confirm 경합 방지). 재호출 시 PAID를 보면 조용히 기존 원장 반환.
  select * into v_purchase from coupon_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 멱등: 이미 PAID면(재시도/orphan 재확정) 기존 CHARGE 원장을 조회해 반환(이중 충전 없음).
  if v_purchase.status = 'PAID' then
    select * into v_row from coupon_ledger
    where purchase_id = p_purchase_id and entry_type = 'CHARGE';
    return v_row;
  end if;

  -- PENDING이 아니면(FAILED/EXPIRED/REFUNDED) 확정 불가.
  if v_purchase.status <> 'PENDING' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  -- 상태 전이 PENDING→PAID + payment_key 기록(payment_key unique가 두 번째 멱등 축).
  update coupon_purchases
  set status = 'PAID', payment_key = p_payment_key, paid_at = now()
  where id = p_purchase_id;

  -- 쿠폰 충전(CHARGE) — 구매 건 unit_price 스냅샷·purchase_id. fn_charge_coupon 재사용
  -- (coupon_ledger unique(purchase_id,'CHARGE')가 세 번째 멱등 축). created_by=구매자(rider).
  v_row := fn_charge_coupon(
    v_purchase.rider_id,
    v_purchase.qty,
    v_purchase.unit_price,
    p_purchase_id,
    '쿠폰 구매 충전',
    v_purchase.rider_id
  );

  return v_row;
end;
$$;

revoke all on function fn_confirm_purchase(uuid, text) from public;
grant execute on function fn_confirm_purchase(uuid, text) to service_role;

-- =========================================================================
-- fn_refund_purchase: PG 환불(admin). 구매 건 단위·건당 1회 한정(07 §1-4).
--   coupon_purchases FOR UPDATE → status='PAID' 확인(아니면 INVALID_TRANSITION — 상태 기반 멱등/건당 1회) →
--   환불 qty ≤ 구매 qty 확인 → rider 원장 FOR UPDATE 직렬화 + 미사용 잔액 재계산(부족 시 INSUFFICIENT_COUPON) →
--   coupon_ledger ADJUST(-qty, purchase_id 필수, unit_price=구매 건 스냅샷) insert(unique(purchase_id,'ADJUST') 멱등) →
--   coupon_purchases.status='REFUNDED'. 반환: 원장 행.
--   순서 주의(Edge): 토스 취소 성공 후 이 RPC 확정(취소 실패 시 원장 무변경). 잔액 부족은
--   Edge fail-fast(order-accept 패턴)로 대부분 걸러 토스 취소 후 RPC 실패를 최소화한다.
-- =========================================================================
create or replace function fn_refund_purchase(
  p_purchase_id uuid,
  p_qty int,
  p_admin_id uuid,
  p_memo text default null
) returns coupon_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase coupon_purchases;
  v_row coupon_ledger;
  v_balance int;
begin
  if p_qty <= 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- 구매 건 직렬화. 상태 기반 멱등: PAID만 환불 가능(REFUNDED/그 외 재호출은 예외 — 건당 1회).
  select * into v_purchase from coupon_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_purchase.status <> 'PAID' then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  -- 환불 qty는 구매 수량을 초과할 수 없다(전액 또는 부분 1회).
  if p_qty > v_purchase.qty then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- rider 단위 직렬화(동시 수락 경합 방지) 후 미사용 잔액 재계산(07 §1-4 · §1-1 ③).
  perform 1 from coupon_ledger where rider_id = v_purchase.rider_id for update;
  select coalesce(sum(qty), 0)::int into v_balance
  from coupon_ledger where rider_id = v_purchase.rider_id;
  if v_balance < p_qty then
    raise exception 'INSUFFICIENT_COUPON' using errcode = 'P0001';
  end if;

  -- PG 환불 원장: ADJUST(-qty, purchase_id 필수, unit_price=구매 건 스냅샷). "purchase_id 있는 ADJUST"는
  -- v_coupon_sales_daily.pg_refund_qty로 구분 집계된다(20260709000002:103).
  -- 멱등: 부분 유니크(purchase_id,'ADJUST') on conflict do nothing.
  insert into coupon_ledger (rider_id, entry_type, qty, unit_price, purchase_id, memo, created_by)
  values (v_purchase.rider_id, 'ADJUST', -p_qty, v_purchase.unit_price, p_purchase_id, p_memo, p_admin_id)
  on conflict (purchase_id, entry_type) where purchase_id is not null do nothing
  returning * into v_row;

  if v_row.id is null then
    -- 동시/재시도로 이미 ADJUST 존재 → 기존 행 반환(멱등).
    select * into v_row from coupon_ledger
    where purchase_id = p_purchase_id and entry_type = 'ADJUST';
  end if;

  update coupon_purchases set status = 'REFUNDED' where id = p_purchase_id;

  return v_row;
end;
$$;

revoke all on function fn_refund_purchase(uuid, int, uuid, text) from public;
grant execute on function fn_refund_purchase(uuid, int, uuid, text) to service_role;
