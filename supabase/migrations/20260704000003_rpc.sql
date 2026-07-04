-- RPC 함수: fn_post_ledger, fn_transition_order
-- 근거:
--   docs/spec/00-domain.md "주문 상태머신" 표 + "포인트 원장 규칙"
--   docs/spec/02-api.md "설계 원칙"(단일 Postgres RPC 트랜잭션) + order-accept/order-transition 절
--   docs/spec/04-tasks.md T3
--   packages/core/src/orderMachine.ts TRANSITIONS (from/action/role/to 1:1 대응)
-- 04-tasks.md T3 DoD, 02-api.md "핵심 RPC: fn_transition_order, fn_post_ledger".
--
-- 이 파일의 함수들은 SECURITY DEFINER로 실행되며 service_role(Edge Function)에서만 호출된다.
-- 클라이언트(anon/authenticated)에는 EXECUTE 권한을 주지 않는다 — CLAUDE.md 절대 규칙 1, 2.

-- =========================================================================
-- fn_post_ledger: point_ledger insert. 멱등(unique(order_id, entry_type, user_id) 충돌 시
-- 에러 없이 기존 행을 반환) — 안전한 재시도 지원.
-- =========================================================================
create or replace function fn_post_ledger(
  p_user_id uuid,
  p_entry_type ledger_type,
  p_amount int,
  p_order_id uuid,
  p_memo text default null,
  p_created_by uuid default null,
  p_withdrawal_id uuid default null
) returns point_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row point_ledger;
begin
  insert into point_ledger (user_id, entry_type, amount, order_id, withdrawal_id, memo, created_by)
  values (p_user_id, p_entry_type, p_amount, p_order_id, p_withdrawal_id, p_memo, p_created_by)
  on conflict (order_id, entry_type, user_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- 이미 존재 (동시 재시도 등) → 기존 행 조회해서 조용히 반환.
    -- order_id가 null인 행은 unique 제약이 여러 행을 허용하므로(WITHDRAW_REQUEST 등)
    -- 이 멱등 조회 경로는 order_id가 not null인 EARN/HOLD/RELEASE 재시도 케이스에서만 의미가 있다.
    select * into v_row from point_ledger
    where order_id is not distinct from p_order_id
      and entry_type = p_entry_type
      and user_id = p_user_id
    order by created_at desc
    limit 1;
  end if;

  return v_row;
end;
$$;

revoke all on function fn_post_ledger(uuid, ledger_type, int, uuid, text, uuid, uuid) from public;

-- =========================================================================
-- fn_transition_order: 주문 상태 전이 + 부수효과(원장 지급 등)를 단일 트랜잭션으로 처리.
-- packages/core/src/orderMachine.ts TRANSITIONS 표를 SQL로 재현.
-- =========================================================================
create or replace function fn_transition_order(
  p_order_id uuid,
  p_action text,
  p_actor_id uuid,
  p_actor_role user_role,
  p_payload jsonb default '{}'::jsonb
) returns pickup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pickup_orders;
  v_from order_status;
  v_measured_kg numeric(8,1);
  v_photo_urls text[];
  v_final_kg numeric(8,1);
  v_earn_amount int;
  v_depot depots;
  v_reason text;
begin
  -- 대상 주문 잠금 (동시 전이 방지).
  select * into v_order from pickup_orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  v_from := v_order.status;

  -- ================= ACCEPT: REQUESTED -> ACCEPTED (rider, 선착순) =================
  -- 02-api.md order-accept: 조건부 UPDATE로 락. 0행이면 ALREADY_ACCEPTED.
  -- 별도 가드(verified/online/무진행주문)는 Edge Function/호출부에서 사전 검증 후 이 RPC를 호출한다.
  if p_action = 'ACCEPT' then
    if p_actor_role <> 'rider' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    update pickup_orders
    set status = 'ACCEPTED', rider_id = p_actor_id, accepted_at = now()
    where id = p_order_id and status = 'REQUESTED'
    returning * into v_order;

    if not found then
      raise exception 'ALREADY_ACCEPTED' using errcode = 'P0001';
    end if;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ACCEPTED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= ARRIVE: ACCEPTED -> ARRIVED (배정 rider 본인) =================
  if p_action = 'ARRIVE' then
    if not (v_from = 'ACCEPTED' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    update pickup_orders set status = 'ARRIVED' where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= SUBMIT_MEASURE: ARRIVED -> ARRIVED (배정 rider 본인) =================
  -- 상태는 유지, measured_kg/photo_urls만 저장 (packages/core orderMachine 주석 4a).
  if p_action = 'SUBMIT_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_measured_kg := (p_payload->>'measuredKg')::numeric(8,1);
    if v_measured_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    select array(select jsonb_array_elements_text(p_payload->'photoUrls')) into v_photo_urls;
    if v_photo_urls is null or array_length(v_photo_urls, 1) is null or array_length(v_photo_urls, 1) < 1 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    update pickup_orders
    set measured_kg = v_measured_kg, photo_urls = v_photo_urls
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= CONFIRM_MEASURE: ARRIVED -> PICKED_UP (supplier 본인) =================
  -- final_kg=measured_kg. EARN(supplier)+HOLD(rider) 지급.
  if p_action = 'CONFIRM_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    if v_order.measured_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_final_kg := v_order.measured_kg;
    -- 00-domain.md: 확정 포인트 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림.
    v_earn_amount := round(v_final_kg * v_order.snapshot_price_per_kg)::int;

    update pickup_orders
    set status = 'PICKED_UP',
        final_kg = v_final_kg,
        supplier_point = v_earn_amount,
        picked_up_at = now()
    where id = p_order_id
    returning * into v_order;

    perform fn_post_ledger(v_order.supplier_id, 'EARN', v_earn_amount, p_order_id,
      'CONFIRM_MEASURE', p_actor_id, null);
    perform fn_post_ledger(v_order.rider_id, 'HOLD', v_order.snapshot_rider_fee, p_order_id,
      'CONFIRM_MEASURE', p_actor_id, null);

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'PICKED_UP', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= DISPUTE: ARRIVED -> DISPUTED (supplier 본인) =================
  if p_action = 'DISPUTE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_reason := p_payload->>'reason';
    if v_reason is null or length(trim(v_reason)) = 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    update pickup_orders
    set status = 'DISPUTED', dispute_reason = v_reason
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'DISPUTED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= RESOLVE_DISPUTE: DISPUTED -> PICKED_UP (admin) =================
  -- finalKg로 CONFIRM_MEASURE와 동일 지급 로직.
  if p_action = 'RESOLVE_DISPUTE' then
    if not (v_from = 'DISPUTED' and p_actor_role = 'admin') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_final_kg := (p_payload->>'finalKg')::numeric(8,1);
    if v_final_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_earn_amount := round(v_final_kg * v_order.snapshot_price_per_kg)::int;

    update pickup_orders
    set status = 'PICKED_UP',
        final_kg = v_final_kg,
        supplier_point = v_earn_amount,
        picked_up_at = now()
    where id = p_order_id
    returning * into v_order;

    perform fn_post_ledger(v_order.supplier_id, 'EARN', v_earn_amount, p_order_id,
      'RESOLVE_DISPUTE', p_actor_id, null);
    perform fn_post_ledger(v_order.rider_id, 'HOLD', v_order.snapshot_rider_fee, p_order_id,
      'RESOLVE_DISPUTE', p_actor_id, null);

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'PICKED_UP', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= DELIVER: PICKED_UP -> DELIVERED -> COMPLETED (배정 rider, QR 검증) =================
  if p_action = 'DELIVER' then
    if not (v_from = 'PICKED_UP' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    select * into v_depot from depots where id = (p_payload->>'depotId')::uuid;
    if not found
      or coalesce(p_payload->>'qrSecret', '') = ''
      or v_depot.qr_secret is distinct from (p_payload->>'qrSecret') then
      raise exception 'INVALID_QR' using errcode = 'P0001';
    end if;

    update pickup_orders
    set status = 'COMPLETED',
        depot_id = v_depot.id,
        delivered_at = now()
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'DELIVERED', p_actor_id, p_payload);
    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, 'DELIVERED', 'COMPLETED', null, '{}'::jsonb);

    perform fn_post_ledger(v_order.rider_id, 'RELEASE', v_order.snapshot_rider_fee, p_order_id,
      'DELIVER', p_actor_id, null);

    return v_order;
  end if;

  -- ================= CANCEL: REQUESTED->CANCELLED(supplier) / ACCEPTED->CANCELLED(admin) ====
  if p_action = 'CANCEL' then
    if v_from = 'REQUESTED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id then
      null; -- allowed
    elsif v_from = 'ACCEPTED' and p_actor_role = 'admin' then
      null; -- allowed
    else
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_reason := p_payload->>'reason';

    update pickup_orders
    set status = 'CANCELLED', cancel_reason = v_reason
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'CANCELLED', p_actor_id, p_payload);

    return v_order;
  end if;

  raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
end;
$$;

revoke all on function fn_transition_order(uuid, text, uuid, user_role, jsonb) from public;
