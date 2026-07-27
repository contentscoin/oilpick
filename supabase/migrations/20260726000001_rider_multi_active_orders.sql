-- [다중 콜 수락] 라이더당 활성 주문 1건 → 최대 3건.
--
-- 배경(CEO, 2026-07-26): 수거 요청은 점주가 한 번에 하나씩 하는 게 맞지만, 콜을 받는 쪽은
-- 거리·동선을 고려해 여러 건을 묶을 수 있어야 한다. 상한은 3건(점주 측 진행중 주문 상한과 동일).
-- 동선 순서 추천/최적화는 이번 범위가 아니다(후속).
--
-- 바뀌는 층:
--   ① 유니크 인덱스 idx_rider_single_active_order 제거 — "N건 이하"는 유니크로 표현 불가.
--      대신 조회 성능용 부분 인덱스를 남긴다(카운트 체크가 매 ACCEPT마다 돈다).
--   ② fn_transition_order ACCEPT: advisory lock + 카운트 체크로 TOCTOU 방어를 이관.
--      인덱스가 하던 일을 RPC가 넘겨받는 것이므로 방어가 약해지지 않는다.
--   ③ fn_find_eligible_riders: "진행중 주문 없음" → "3건 미만"으로 완화(매칭 대상 확대).
-- Edge order-accept 가드와 라이더 앱은 별도 커밋에서 함께 바뀐다.

-- ── ① 유니크 → 일반 부분 인덱스 ────────────────────────────────────────────
drop index if exists idx_rider_single_active_order;
create index if not exists idx_rider_active_orders
  on pickup_orders (rider_id)
  where status in ('ACCEPTED', 'ARRIVED', 'PICKED_UP', 'DISPUTED');

-- ── ② ACCEPT 상한 게이트 ──────────────────────────────────────────────────
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

    -- 라이더당 활성 주문 상한(MAX_RIDER_ACTIVE_ORDERS=3). 이전에는 유니크 인덱스
    -- idx_rider_single_active_order가 1건 불변식을 강제했으나, 거리·동선을 묶어 여러 콜을 받게
    -- 하려면 "N건 이하"가 필요하고 그건 유니크 인덱스로 표현할 수 없다. 인덱스를 걷어내는 대신
    -- **여기서 직렬화된 카운트 체크**로 TOCTOU를 막는다 — advisory lock이 같은 라이더의 동시
    -- 수락을 줄세우므로, 두 콜이 동시에 들어와도 상한을 넘겨 통과하지 못한다.
    -- (주문 단위 이중배정은 아래 `where status='REQUESTED'` 조건부 update가 계속 막는다.)
    perform pg_advisory_xact_lock(hashtext('rider_active:' || p_actor_id::text));
    if (
      select count(*) from pickup_orders o
      where o.rider_id = p_actor_id
        and o.status in ('ACCEPTED', 'ARRIVED', 'PICKED_UP', 'DISPUTED')
    ) >= 3 then
      raise exception 'RIDER_TOO_MANY_ACTIVE' using errcode = 'P0001';
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
revoke execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) from public, anon, authenticated;
grant execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb, text) to service_role;

-- ── ③ 매칭: 활성 3건 미만 라이더까지 브로드캐스트 대상에 포함 ──────────────
create or replace function fn_find_eligible_riders(
  p_lat double precision,
  p_lng double precision,
  p_radius_km int
) returns table (rider_id uuid)
language sql
security definer
set search_path = public
as $$
  select r.id
  from rider_profiles r
  where r.verify_status = 'APPROVED'
    and r.is_online
    and r.last_location is not null
    and ST_DWithin(
      r.last_location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    -- 활성 주문이 상한 미만인 라이더만. 기존에는 `not exists`(=0건)였다.
    -- DISPUTED는 라이더가 손쓸 수 없는 상태라 상한 계산에는 포함하되(ACCEPT 게이트와 동일 집합)
    -- 여기서도 같은 집합을 세어 두 곳의 판정이 어긋나지 않게 한다.
    and (
      select count(*) from pickup_orders o
      where o.rider_id = r.id
        and o.status in ('ACCEPTED', 'ARRIVED', 'PICKED_UP', 'DISPUTED')
    ) < 3;
$$;

revoke all on function fn_find_eligible_riders(double precision, double precision, int) from public;
revoke execute on function fn_find_eligible_riders(double precision, double precision, int) from public, anon, authenticated;
grant execute on function fn_find_eligible_riders(double precision, double precision, int) to service_role;
