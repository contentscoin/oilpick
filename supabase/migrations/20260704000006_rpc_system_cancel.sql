-- fn_transition_order: CANCEL 액션에 "시스템" 액터 경로 추가.
--
-- 배경(재시도 2 리뷰 지적사항 원인 수정):
-- 00-domain.md:30 "REQUESTED→CANCELLED | supplier 또는 시스템 | 수락 전 언제나 / 브로드캐스트
-- 30분 무수락 시 자동"에 명시된 대로, 30분 무수락 자동취소는 "시스템"이 트리거하는 정상 전이다.
-- 그런데 20260704000003_rpc.sql의 CANCEL 분기는 REQUESTED+actor_role='supplier' 또는
-- ACCEPTED+actor_role='admin'만 허용했고, user_role enum(01-db-schema.sql:7)에는 'system' 값이
-- 없어 이 경로가 RPC에 아예 구현돼 있지 않았다. 그 결과 order-expire Edge Function이
-- fn_transition_order를 우회해 pickup_orders를 직접 UPDATE하는 구조적 위반이 생겼다
-- (CLAUDE.md/04-tasks.md 절대 규칙 "상태머신은 RPC(fn_transition_order)로만" 위반).
--
-- 해결: user_role enum에 값을 추가하는 대신(profiles.role 등 실제 사용자 role과 섞이면
-- 안전하지 않음 — "시스템"은 로그인 계정이 아니므로 profiles에 대응 row가 없다),
-- "actor_id가 NULL이고 actor_role도 NULL"인 호출을 시스템 액터로 간주하는 명시적 규약을
-- 둔다. order_events.actor_id 컬럼 주석("null = 시스템", 01-db-schema.sql:106)과 정합적이다.
-- p_actor_role 파라미터 타입/시그니처는 그대로 유지(user_role은 nullable 파라미터이므로
-- SQL NULL 전달 가능) — service_role GRANT(20260704000005_grants.sql)도 재적용 불필요.

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

  -- ================= CANCEL: REQUESTED->CANCELLED(supplier 본인 / 시스템) / ACCEPTED->CANCELLED(admin) ====
  -- 00-domain.md:30 "REQUESTED→CANCELLED | supplier 또는 시스템". 시스템 액터는 사람 계정이
  -- 아니므로 profiles/user_role에 대응 값이 없다 — actor_id=NULL, actor_role=NULL 조합을
  -- "시스템"의 명시적 신호로 취급한다(order_events.actor_id 컬럼 주석 "null = 시스템"과 정합).
  -- 이 경로는 order-expire의 30분 무수락 자동취소(사유 NO_RIDER) 전용이며, 클라이언트/사람
  -- actor는 절대 actor_role=NULL로 호출할 수 없다(Edge Function이 항상 profiles에서 재조회한
  -- role을 넘기므로 사람 호출에서 NULL은 나올 수 없음 — _shared/auth.ts requireAuth 참고).
  if p_action = 'CANCEL' then
    if v_from = 'REQUESTED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id then
      null; -- allowed: supplier 본인 취소
    elsif v_from = 'REQUESTED' and p_actor_id is null and p_actor_role is null then
      null; -- allowed: 시스템 자동 취소 (30분 무수락)
    elsif v_from = 'ACCEPTED' and p_actor_role = 'admin' then
      null; -- allowed: admin 취소
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
