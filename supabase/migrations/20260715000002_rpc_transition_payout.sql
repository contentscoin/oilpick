-- [08 G2-②] fn_transition_order — 현장 지급수단(현금·포인트) 피벗. 20260709000010 최종본 기준.
--
-- 변경 요약(분기별, docs/spec/08-payout-pivot.md §1-1):
--   SUBMIT_MEASURE  : payload.payoutMethod('CASH'|'POINT') 파싱·검증 → pickup_orders.payout_method 기록.
--                     생략 시 CASH 폴백(구버전 번들 호환 — 신 클라이언트는 Edge zod가 필수 강제).
--                     재제출 시 수단 변경 가능(기존 final_kg 재제출 가드 그대로).
--   CONFIRM_MEASURE : payout_method='POINT'면 완료와 같은 트랜잭션에서 supplier에게
--                     fn_post_ledger EARN(+확정 지급액) 발행 — 07 D1의 "신규 발행 중지" 해제(08 P3).
--                     멱등은 point_ledger unique(order_id, entry_type, user_id)가 담당.
--                     null=CASH 간주(coalesce — 레거시·중재 봉쇄 희귀 케이스 교착 방지).
--   FORCE_COMPLETE  : 동일 POINT EARN 로직(admin 교착 해소 경로도 지급 의미 동일).
--   ACCEPT          : 무변경 — 쿠폰 CONSUME 분기는 전환기 잔존 주문(coupon_cost not null) 전용으로
--                     보존(08 P1: order-create가 coupon_cost 스냅샷을 중지해 신규 주문은 자연 skip).
--   CANCEL          : 무변경 — 쿠폰 REFUND 분기도 레거시 잔존 주문 전용으로 보존.
--   DELIVER         : 무변경 — 레거시 완결 전용(지급 없음, 07 D1 보강 유지).
--
-- 시그니처는 20260709000004와 동일(6-인자). CREATE OR REPLACE.

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
  v_payout payout_method;
  v_payout_text text;
begin
  -- 대상 주문 잠금 (동시 전이 방지).
  select * into v_order from pickup_orders where id = p_order_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  v_from := v_order.status;

  -- ================= ACCEPT: REQUESTED -> ACCEPTED (rider, 선착순) =================
  -- [08 P1] 쿠폰 게이트 소멸 — 신규 주문은 coupon_cost null이라 CONSUME 분기를 자연 통과.
  -- 분기 자체는 전환기 잔존 쿠폰 주문(coupon_cost not null)의 완결을 위해 보존한다.
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

    -- 레거시 쿠폰 소진: coupon_cost not null(07 잔존 주문)일 때만. 부족 예외 시 전체 롤백.
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
  -- 상태 유지, measured_kg/photo_urls/payout_method 저장. 중재 완료(final_kg 고정) 주문은 재제출 거부.
  if p_action = 'SUBMIT_MEASURE' then
    if not (v_from = 'ARRIVED' and p_actor_role = 'rider' and v_order.rider_id = p_actor_id) then
      raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
    end if;

    -- 중재로 kg가 확정된 주문(final_kg not null)은 재제출 불가(07 §1-3 RESOLVE_DISPUTE 재정의).
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

    -- [08 P2] 지급수단: 값이 있으면 CASH|POINT만 허용, 생략/명시적 null이면 CASH 폴백(구버전 번들 호환).
    -- 신 클라이언트는 order-transition Edge zod가 필수를 강제한다. 재제출로 수단 변경 가능.
    -- ->>는 키 부재·JSON null을 모두 SQL NULL로 반환한다. `? '키'` + `NULL not in (...)`(→NULL, 미발화)
    -- 조합은 명시적 null을 payout_method NULL로 남겨 "계량 전"으로 오표시될 수 있어, 텍스트를 한 번
    -- 추출해 NULL(부재/명시적 null)은 CASH 폴백, 유효하지 않은 문자열만 거부한다.
    v_payout_text := p_payload->>'payoutMethod';
    if v_payout_text is null then
      v_payout := 'CASH';
    elsif v_payout_text not in ('CASH', 'POINT') then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    else
      v_payout := v_payout_text::payout_method;
    end if;

    update pickup_orders
    set measured_kg = v_measured_kg, photo_urls = v_photo_urls, payout_method = v_payout
    where id = p_order_id
    returning * into v_order;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'ARRIVED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= CONFIRM_MEASURE: ARRIVED -> COMPLETED (supplier 본인) =================
  -- 의미: "무게 확인 + 지급 확인"(2자 확인). CASH=현금 수령 확인 / POINT=적립 확인(EARN 원자 발행).
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

    -- [08 P3] POINT 지급: 완료와 같은 트랜잭션에서 supplier EARN 발행.
    -- 멱등은 point_ledger unique(order_id, entry_type, user_id) + fn_post_ledger on conflict가 담당.
    -- null=CASH 간주(레거시·중재 봉쇄 희귀 케이스 — 교착 없음).
    if coalesce(v_order.payout_method, 'CASH') = 'POINT' then
      perform fn_post_ledger(v_order.supplier_id, 'EARN', v_cash, p_order_id,
        'CONFIRM_MEASURE', p_actor_id, null);
    end if;

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
  -- 중재는 kg 확정까지만. final_kg 고정 후 ARRIVED 복귀(지급·수령 확인이 남음).
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

  -- ================= FORCE_COMPLETE: ARRIVED -> COMPLETED (admin, 07 D6 승계) =================
  -- 교착 해소: 계량 제출/중재 후 점주가 수령 확인을 거부·방치할 때 admin이 완료 처리.
  -- 지급 로직은 CONFIRM_MEASURE와 동일(POINT면 EARN 발행 — 08 P3).
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

    if coalesce(v_order.payout_method, 'CASH') = 'POINT' then
      perform fn_post_ledger(v_order.supplier_id, 'EARN', v_cash, p_order_id,
        'FORCE_COMPLETE', p_actor_id, null);
    end if;

    insert into order_events (order_id, from_status, to_status, actor_id, payload)
    values (p_order_id, v_from, 'COMPLETED', p_actor_id, p_payload);

    return v_order;
  end if;

  -- ================= DELIVER: PICKED_UP -> DELIVERED -> COMPLETED (레거시 완결 전용) =================
  -- 레거시 주문(PICKED_UP 잔존분) 완결용. 신규 주문은 PICKED_UP에 도달하지 않는다. enum 값 삭제 금지.
  -- [07 D1 보강] 지급 없음 — 배송 완료는 어떤 경우에도 라이더 지급 이벤트가 아니다.
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
  -- REQUESTED→CANCELLED: supplier 자진 / 시스템 만료.
  -- {ACCEPTED|ARRIVED|DISPUTED}→CANCELLED: admin 전용 + p_fault 필수(07 D4·D6 승계 — 감사 기록).
  if p_action = 'CANCEL' then
    if v_from = 'REQUESTED' and p_actor_role = 'supplier' and v_order.supplier_id = p_actor_id then
      null; -- supplier 자진 취소
    elsif v_from = 'REQUESTED' and p_actor_id is null and p_actor_role is null then
      null; -- 시스템 30분 무수락 자동취소
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

    -- 레거시 쿠폰 환급: 07 잔존 쿠폰 주문(coupon_cost not null + CONSUME 존재·qty 일치)에서만.
    -- 신규 주문(coupon_cost null)은 무영향(08 P1).
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
