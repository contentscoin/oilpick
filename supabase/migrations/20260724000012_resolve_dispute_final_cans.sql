-- [14 J4] RESOLVE_DISPUTE에 finalCans(선택) 추가 — 14 §3 "RESOLVE_DISPUTE: finalKg 필수 유지 +
-- finalCans 선택 추가"와 §8 "분쟁 finalCans 선택"이 명시한 항목인데 J2에서 누락됐다.
--
-- 문제: 구매 동반 주문이 분쟁 중재를 거치면 final_kg만 정정되고 delivered_cans는 손댈 수 없다.
-- SUBMIT_MEASURE는 앞단의 "final_kg is not null → INVALID_TRANSITION" 가드에 막혀 라이더 재제출로도
-- 고칠 수 없고, pickup_orders에는 update 정책이 없어 클라이언트/어드민 경로로도 직접 정정이 불가능하다.
-- 그 결과 잘못된 통수가 그대로 fn_settle_trade의 purchase_amount(= delivered_cans × 신유 고시가)로
-- 확정돼 상계 금액이 틀어진다. 유일한 우회는 주문 취소였다.
--
-- 20260724000009의 함수 정의를 그대로 가져와 RESOLVE_DISPUTE 분기에만 finalCans 처리를 더한다.

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
  v_final_cans int;
  v_order pickup_orders;
  v_from order_status;
  v_measured_kg numeric(8,1);
  v_photo_urls text[];
  v_final_kg numeric(8,1);
  v_memo text;
  v_depot depots;
  v_reason text;
  v_consume coupon_ledger;
  v_payout payout_method;
  v_payout_text text;
  v_delivered_cans int;
  v_purchase_involved boolean;
begin
  -- 대상 주문 잠금 (동시 전이 방지).
  select * into v_order from pickup_orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  v_from := v_order.status;

  -- ================= ACCEPT: REQUESTED -> ACCEPTED (rider, 선착순) =================
  if p_action = 'ACCEPT' then
    if p_actor_role <> 'rider' then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

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

    -- [14 J1] arrived_at 스탬프 — 타임라인 'ARRIVED' 노드 시각 표기.
    update pickup_orders set status = 'ARRIVED', arrived_at = now() where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= SUBMIT_MEASURE: ARRIVED -> ARRIVED (배정 rider 본인) =================
  if p_action = 'SUBMIT_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    -- 중재로 kg가 확정된 주문(final_kg not null)은 재제출 불가(07 §1-3).
    if v_order.final_kg is not null then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_purchase_involved := coalesce(v_order.order_kind in ('PURCHASE', 'MIXED'), false);  -- [J4] NULL(레거시) → false 고정

    -- [14 J2] measuredKg: 구매 동반이면 ≥0(폐유 없이 신유만 받는 경우 0 허용), 순수 수거는 >0 필수.
    -- (zod kgSchema는 nonnegative라 0을 막지 못해 RPC에서 강제한다.)
    v_measured_kg := (p_payload->>'measuredKg')::numeric(8,1);
    if v_measured_kg is null or v_measured_kg < 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;
    if not v_purchase_involved and v_measured_kg = 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    select array(select jsonb_array_elements_text(p_payload->'photoUrls')) into v_photo_urls;
    if v_photo_urls is null or array_length(v_photo_urls, 1) is null or array_length(v_photo_urls, 1) < 1 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    -- [08 P2] 지급수단: 값이 있으면 CASH|POINT만, 생략/명시적 null이면 CASH 폴백(구버전 번들 호환).
    v_payout_text := p_payload->>'payoutMethod';
    if v_payout_text is null then
      v_payout := 'CASH';
    elsif v_payout_text not in ('CASH', 'POINT') then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    else
      v_payout := v_payout_text::payout_method;
    end if;

    -- [14 J2] deliveredCans: 구매 동반(PURCHASE/MIXED) 시 필수 0..50 — 구번들 침묵 0 방지.
    -- 순수 수거는 배달 없음(null 유지).
    if v_purchase_involved then
      v_delivered_cans := (p_payload->>'deliveredCans')::int;
      if v_delivered_cans is null or v_delivered_cans < 0 or v_delivered_cans > 50 then
        raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
      end if;
    else
      v_delivered_cans := null;
    end if;

    update pickup_orders
    set measured_kg = v_measured_kg, photo_urls = v_photo_urls, payout_method = v_payout,
        delivered_cans = v_delivered_cans
    where id = p_order_id
    returning * into v_order;

    -- [14 J1] 바코드 1급 적재(replace-set). 원본 payload는 아래 order_events에 그대로 보존.
    if p_payload ? 'barcodes' then
      delete from pickup_items where order_id = p_order_id;
      insert into pickup_items (order_id, rider_id, barcode, geo_lat, geo_lng, captured_at)
      select
        p_order_id,
        p_actor_id,
        bc,
        (p_payload->'geo'->>'lat')::double precision,
        (p_payload->'geo'->>'lng')::double precision,
        (p_payload->'geo'->>'capturedAt')::timestamptz
      from jsonb_array_elements_text(p_payload->'barcodes') as bc
      on conflict (order_id, barcode) do nothing;
    end if;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= CONFIRM_MEASURE: ARRIVED -> COMPLETED (supplier 본인) =================
  -- 의미: "무게 확인 + 지급 확인". 상계 정산은 fn_settle_trade가 수행(POINT면 EARN/TRADE_PURCHASE 원자 발행).
  if p_action = 'CONFIRM_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_order := fn_settle_trade(p_order_id, p_actor_id, 'CONFIRM_MEASURE');

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
  if p_action = 'RESOLVE_DISPUTE' then
    if not (v_from = 'DISPUTED' and p_actor_role = 'admin') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_final_kg := (p_payload->>'finalKg')::numeric(8,1);
    if v_final_kg is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    -- [14 J4] finalCans(선택) — 구매 동반 주문의 배달 통수 중재 정정(14 §3·§8).
    -- 없으면 delivered_cans를 그대로 둔다. SUBMIT_MEASURE는 final_kg가 있으면 막히므로
    -- 중재 이후 라이더 재제출로 통수를 고칠 경로가 없어, 여기서 정정하지 못하면
    -- 잘못된 통수가 그대로 fn_settle_trade의 purchase_amount로 확정된다.
    if p_payload ? 'finalCans' then
      v_final_cans := (p_payload->>'finalCans')::int;
      if v_final_cans is null or v_final_cans < 0 or v_final_cans > 50 then
        raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
      end if;
    end if;

    update pickup_orders
    set status = 'ARRIVED', final_kg = v_final_kg,
        delivered_cans = coalesce(v_final_cans, delivered_cans)
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= FORCE_COMPLETE: ARRIVED -> COMPLETED (admin, D6 승계) =================
  -- 교착 해소: 정산 로직은 CONFIRM_MEASURE와 동일(fn_settle_trade).
  if p_action = 'FORCE_COMPLETE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'admin') then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    v_memo := p_payload->>'memo';
    if v_memo is null or length(trim(v_memo)) = 0 then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;

    v_order := fn_settle_trade(p_order_id, p_actor_id, 'FORCE_COMPLETE');

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'COMPLETED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= DELIVER: PICKED_UP -> DELIVERED -> COMPLETED (레거시 완결 전용) =================
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

    return v_order;
  end if;

  -- ================= CANCEL =================
  if p_action = 'CANCEL' then
    if v_from = 'REQUESTED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id then
      null; -- supplier 자진 취소
    elsif v_from = 'REQUESTED' and p_actor_id is null and p_actor_role is null then
      null; -- 시스템 30분 무수락 자동취소
    elsif v_from in ('ACCEPTED','ARRIVED','DISPUTED') and p_actor_role = 'admin' then
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

    -- 레거시 쿠폰 환급: 잔존 쿠폰 주문에서만.
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
-- 20260724000010의 잠금 유지(create or replace는 ACL을 보존하지만 부분 재적용 대비 멱등 처리).
revoke execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) from public, anon, authenticated;
grant execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) to service_role;
