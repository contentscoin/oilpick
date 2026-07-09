-- [07 F11-①] fn_transition_order ACCEPT 규제 게이트 — SUSPENDED/미승인 라이더 콜 수락 차단.
--
-- 배경: open_calls RLS(p_order_open_calls)와 order-accept Edge 가드가 이미 verify_status='APPROVED'를
-- 체크하지만, 두 계층 모두 클라이언트/Edge 경로다. F3a가 "동시성 방어의 유일한 진실"로 규정한
-- 이 RPC 계층에서도 게이트를 강제해(defense-in-depth) SUSPENDED 라이더가 어떤 경로로도 새 콜을
-- 잡지 못하게 한다 — 규제 게이트(무신고/정지 라이더 수거 = 법적 리스크)의 최심층 차단선.
--
-- 범위: 게이트는 ACCEPT(신규 콜 배정)에만 적용. ARRIVE/SUBMIT_MEASURE/CONFIRM_MEASURE/DELIVER 등
-- 진행 전이는 무게이트 — 정지 시점의 진행중 주문은 완결까지 허용(07 F11: "운행 차단은 스펙 밖").
-- 라이더당 활성 주문 1건(idx_rider_single_active_order)이라 진행중 허용 범위는 자연히 1건으로 유한.
--
-- 시그니처는 20260709000004와 동일(6-인자). CREATE OR REPLACE로 ACCEPT 분기에 verify 가드 1개만
-- 추가하고 나머지 전이는 그대로 유지한다. 07 §1-3 상태머신·00-domain.md "라이더 인증" 동기화.

create or replace function fn_transition_order(
  p_order_id uuid,
  p_action text,
  p_actor_id uuid,
  p_actor_role user_role,
  p_payload jsonb default '{}'::jsonb,
  p_fault text default null
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
  v_cash int;
  v_memo text;
  v_depot depots;
  v_reason text;
  v_consume coupon_ledger;
begin
  -- 대상 주문 잠금 (동시 전이 방지).
  select * into v_order from pickup_orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  v_from := v_order.status;

  -- ================= ACCEPT: REQUESTED -> ACCEPTED (rider, 선착순) + 쿠폰 CONSUME =================
  if p_action = 'ACCEPT' then
    if p_actor_role <> 'rider' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    -- [07 F11] 규제 게이트: 승인된 라이더만 신규 콜 수락 가능(SUSPENDED/PENDING/REJECTED 차단).
    if not exists (
      select 1 from rider_profiles r
      where r.id = p_actor_id and r.verify_status = 'APPROVED'
    ) then
      raise exception 'RIDER_NOT_ELIGIBLE' using errcode = 'P0001';
    end if;

    update pickup_orders
    set status = 'ACCEPTED', rider_id = p_actor_id, accepted_at = now()
    where id = p_order_id and status = 'REQUESTED'
    returning * into v_order;

    if not found then
      raise exception 'ALREADY_ACCEPTED' using errcode = 'P0001';
    end if;

    -- 쿠폰 소진: coupon_cost not null(신 주문)일 때만. 부족 예외 시 트랜잭션 전체 롤백(REQUESTED 잔존).
    -- (coupon_cost null=레거시 → skip. 동시성 방어의 유일한 진실은 fn_consume_coupon의 FOR UPDATE.)
    if v_order.coupon_cost is not null then
      perform fn_consume_coupon(p_actor_id, p_order_id, v_order.coupon_cost);
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
  -- 상태 유지, measured_kg/photo_urls 저장. 중재 완료(final_kg 고정) 주문은 재제출 거부.
  if p_action = 'SUBMIT_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    -- 중재로 kg가 확정된 주문(final_kg not null)은 재제출 불가(§1-3 RESOLVE_DISPUTE 재정의).
    -- 신 정상 경로에서 ARRIVED 체류 중 final_kg는 항상 null(CONFIRM_MEASURE가 COMPLETED와 동시에
    -- final_kg를 기록)이므로 "final_kg not null"을 중재 완료 마킹으로 사용한다.
    if v_order.final_kg is not null then
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

  -- ================= CONFIRM_MEASURE: ARRIVED -> COMPLETED (supplier 본인) =================
  -- 의미 재정의: "무게 확인 + 현금 ₩N 수령 확인"(2자 확인). EARN/HOLD 발행 제거, 즉시 완료.
  if p_action = 'CONFIRM_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    -- 중재 완료 주문은 final_kg(중재 kg), 일반 주문은 measured_kg 기준.
    v_final_kg := coalesce(v_order.final_kg, v_order.measured_kg);
    if v_final_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_cash := round(v_final_kg * v_order.snapshot_price_per_kg)::int;

    update pickup_orders
    set status = 'COMPLETED',
        final_kg = v_final_kg,
        cash_paid_amount = v_cash,
        completed_at = now()
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'COMPLETED', p_actor_id, p_payload);

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

  -- ================= RESOLVE_DISPUTE: DISPUTED -> ARRIVED (admin) =================
  -- 의미 재정의: 중재는 kg 확정까지만. final_kg 고정 후 ARRIVED 복귀(현금 지급·수령 확인이 남음).
  -- 이후 SUBMIT_MEASURE는 final_kg 가드로 거부, CONFIRM_MEASURE가 중재 kg로 완료(2자 확인 유지).
  if p_action = 'RESOLVE_DISPUTE' then
    if not (v_from = 'DISPUTED' and p_actor_role = 'admin') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_final_kg := (p_payload->>'finalKg')::numeric(8,1);
    if v_final_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    update pickup_orders
    set status = 'ARRIVED', final_kg = v_final_kg
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= FORCE_COMPLETE: ARRIVED -> COMPLETED (admin, D6) =================
  -- 교착 해소: 계량 제출/중재 후 점주가 수령 확인을 거부·방치할 때 admin이 완료 처리.
  -- 계량(measured) 또는 중재(final) kg 존재 + memo(사유) 필수.
  if p_action = 'FORCE_COMPLETE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'admin') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_final_kg := coalesce(v_order.final_kg, v_order.measured_kg);
    if v_final_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_memo := p_payload->>'memo';
    if v_memo is null or length(trim(v_memo)) = 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_cash := round(v_final_kg * v_order.snapshot_price_per_kg)::int;

    update pickup_orders
    set status = 'COMPLETED',
        final_kg = v_final_kg,
        cash_paid_amount = v_cash,
        completed_at = now()
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'COMPLETED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= DELIVER: PICKED_UP -> DELIVERED -> COMPLETED (레거시 보존) =================
  -- 레거시 주문(PICKED_UP 잔존분) 완결용. 신규 주문은 PICKED_UP에 도달하지 않는다. enum 값 삭제 금지.
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

  -- ================= CANCEL =================
  -- REQUESTED→CANCELLED: supplier 자진 / 시스템 만료(무변경, 쿠폰 미소진).
  -- {ACCEPTED|ARRIVED|DISPUTED}→CANCELLED: admin 전용 + p_fault 필수(D4·D6).
  if p_action = 'CANCEL' then
    if v_from = 'REQUESTED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id then
      null; -- supplier 자진 취소 (쿠폰 미소진)
    elsif v_from = 'REQUESTED' and p_actor_id is null and p_actor_role is null then
      null; -- 시스템 30분 무수락 자동취소 (쿠폰 미소진)
    elsif v_from in ('ACCEPTED','ARRIVED','DISPUTED') and p_actor_role = 'admin' then
      -- admin 취소: 귀책(fault) 필수. 'SUPPLIER'|'RIDER'|'SYSTEM' 외 값·누락은 예외.
      if p_fault is null or p_fault not in ('SUPPLIER','RIDER','SYSTEM') then
        raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
      end if;
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

    -- 귀책 환급: admin 취소 + fault SUPPLIER/SYSTEM + 신 주문(coupon_cost not null)일 때만.
    -- REFUND 전 동일 order_id+rider_id의 CONSUME 존재·qty 일치 확인, 없으면 skip(레거시 무근거 환급 방지).
    -- 멱등: unique(order_id,'REFUND',rider_id) + on conflict do nothing(재취소 안전).
    if p_actor_role = 'admin' and p_fault in ('SUPPLIER','SYSTEM')
       and v_order.coupon_cost is not null and v_order.rider_id is not null then
      select * into v_consume from coupon_ledger
      where order_id = p_order_id and entry_type = 'CONSUME' and rider_id = v_order.rider_id;
      if found and v_consume.qty = -v_order.coupon_cost then
        insert into coupon_ledger (rider_id, entry_type, qty, order_id, memo, created_by)
        values (v_order.rider_id, 'REFUND', v_order.coupon_cost, p_order_id,
                'CANCEL fault=' || p_fault, p_actor_id)
        on conflict (order_id, entry_type, rider_id) do nothing;
      end if;
    end if;

    return v_order;
  end if;

  raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
end;
$$;

revoke all on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) from public;
grant execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) to service_role;
