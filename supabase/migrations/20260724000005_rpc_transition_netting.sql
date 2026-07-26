-- [14 J2] 신유 구매·현장 상계 코어. docs/spec/14-fresh-oil-settlement.md §3.
-- 20260724000002(추적) 최종본 위에 상계 정산을 얹는다. 하위호환: 구매 미동반(order_kind
-- null/PICKUP)이면 net=폐유총액 → 기존 EARN/금액과 동일(pgTAP 회귀로 고정).
--
--   fn_settle_trade(신규 헬퍼) : CONFIRM_MEASURE·FORCE_COMPLETE 공통 완료 정산.
--     v_waste = round(final_kg × 시세) → cash_paid_amount(동결 = 폐유 총액)
--     v_purchase = delivered_cans × snapshot_fresh_can_price(정수곱)
--     v_net = v_waste − v_purchase  → net_amount(음수 가능)
--     POINT & net>0 : EARN(+net)  / POINT & net<0 : 잔액검사 후 TRADE_PURCHASE(−|net|)
--     net=0 또는 CASH : 원장 무기록(현장 현금). 전무거래(폐유0 & 신유0)는 거부.
--     (좌상 크레딧 게이트는 J3에서 이 함수 재정의로 추가 — fn_transition_order는 무변경.)
--   SUBMIT_MEASURE : deliveredCans(구매 동반 시 필수 0..50) 저장 + measuredKg>0 게이트를
--     order_kind 조건부로 완화(구매 동반이면 ≥0 허용, 순수 수거는 >0 필수).

-- ===================== fn_settle_trade (완료 정산 헬퍼) =====================
create or replace function fn_settle_trade(
  p_order_id uuid,
  p_actor_id uuid,
  p_source text
) returns pickup_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pickup_orders;
  v_final_kg numeric(8,1);
  v_waste int;
  v_purchase int;
  v_net int;
  v_available int;
begin
  select * into v_order from pickup_orders where id = p_order_id for update;

  -- 중재 완료 주문은 final_kg(중재 kg), 일반 주문은 measured_kg 기준.
  v_final_kg := coalesce(v_order.final_kg, v_order.measured_kg);
  if v_final_kg is null then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  -- 폐유 총액(동결 의미) + 신유 대금(정수곱, 반올림 없음) → NET.
  v_waste := round(v_final_kg * v_order.snapshot_price_per_kg)::int;
  v_purchase := coalesce(v_order.delivered_cans, 0) * coalesce(v_order.snapshot_fresh_can_price, 0);
  v_net := v_waste - v_purchase;

  -- 전무거래(폐유 0 & 신유 0)는 완료 불가 — 방문 자체가 무의미(엣지케이스 G).
  if v_waste = 0 and v_purchase = 0 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;

  update pickup_orders
  set status = 'COMPLETED',
      final_kg = v_final_kg,
      cash_paid_amount = v_waste,      -- 동결: 폐유 총액(기존 뷰·통계 계약 유지)
      purchase_amount = v_purchase,
      net_amount = v_net,
      completed_at = now()
  where id = p_order_id
  returning * into v_order;

  -- NET 잔액을 payout_method로 정산. CASH는 원장 무기록(현장 현금 교환).
  if coalesce(v_order.payout_method, 'CASH') = 'POINT' then
    if v_net > 0 then
      -- 점주 수령(+) → EARN. 멱등은 point_ledger unique(order_id,entry_type,user_id)가 담당.
      perform fn_post_ledger(v_order.supplier_id, 'EARN', v_net, p_order_id, p_source, p_actor_id, null);
    elsif v_net < 0 then
      -- 점주 지불(−) → TRADE_PURCHASE 차감. 출금과 동일 직렬화+잔액검사(음수 잔액 금지).
      perform 1 from point_ledger where user_id = v_order.supplier_id for update;
      select coalesce(sum(case
        when entry_type = 'HOLD' then 0
        when entry_type = 'RELEASE' then amount
        else amount end), 0)::int
      into v_available
      from point_ledger
      where user_id = v_order.supplier_id;
      if v_available < (-v_net) then
        raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
      end if;
      perform fn_post_ledger(v_order.supplier_id, 'TRADE_PURCHASE', v_net, p_order_id, p_source, p_actor_id, null);
    end if;
    -- v_net = 0: 원장 무기록.
  end if;

  return v_order;
end;
$$;

revoke all on function fn_settle_trade(uuid, uuid, text) from public;
grant execute on function fn_settle_trade(uuid, uuid, text) to service_role;

-- ===================== fn_transition_order (상계 반영 재정의) =====================
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

    v_purchase_involved := v_order.order_kind in ('PURCHASE', 'MIXED');

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

    update pickup_orders
    set status = 'ARRIVED', final_kg = v_final_kg
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
grant execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) to service_role;
