-- [17 Q5] 좌상 쿠폰 실적 — v_dealer_rider_stats에 coupon_used_qty append.
--
-- 17-coupon-revival.md C5: 사용한 쿠폰 비용은 좌상이 "플랫폼 실적"으로 확인만 한다.
-- **조회 전용** — 좌상 정산 체인(14)에 쿠폰은 편입하지 않는다(fn_create_dealer_claim 무변경).
--
-- 경로 제약(핵심, 17 C5): 집계는 반드시 pickup_orders.coupon_cost 경유로만 한다.
--   coupon_ledger의 RLS(p_coupon_ledger_read)는 본인(rider)+admin만 허용하고 이 뷰는
--   security_invoker라, 좌상(dealer)으로 평가되는 coupon_ledger 조인은 **항상 0행**이 되어
--   에러 없이 값만 비는 무음 결손이 된다 → 조인 금지. 좌상이 읽을 수 있는 유일 경로는
--   pickup_orders(RLS p_orders_read_by_dealer: dealer_id = auth.uid() 스냅샷 기준)뿐이다.
--
-- coupon_used_qty = 해당 라이더의 **완료(COMPLETED) 주문 coupon_cost 합**(null→0).
--   미완료 주문은 세지 않는다 — 소진(CONSUME)은 수락 시점이지만 취소 시 귀책 환급(REFUND)으로
--   되돌 수 있어, 완료 확정분만 "사용 실적"으로 계상한다(17 C5 문언 '완료 주문 coupon_cost 합').
--   레거시·무쿠폰 전환기 주문(coupon_cost null)은 sum이 무시 + coalesce로 0(17 리스크 '전환기 혼재').
--
-- 기존 컬럼 순서·이름·타입 전부 보존, 신규 컬럼은 끝에만 append(20260724000011 append-only 계약 유지).
-- v_dealer_active_orders는 재무 컬럼 제외 원칙(16 L6, pgTAP columns_are 고정) — 손대지 않는다.

create or replace view v_dealer_rider_stats with (security_invoker = true) as
select
  rp.id                                   as rider_id,
  rp.dealer_id                            as dealer_id,
  p.display_name                          as rider_name,
  rp.verify_status                        as verify_status,
  rp.is_online                            as is_online,
  coalesce(o.completed_count, 0)          as completed_count,
  coalesce(o.collected_kg, 0)             as collected_kg,
  coalesce(o.cash_paid, 0)                as cash_paid,
  coalesce(o.point_paid, 0)               as point_paid,
  coalesce(rs.signed_up, 0)               as referral_signed_up,
  coalesce(rs.activated, 0)               as referral_activated,
  -- [17 Q5 append] 완료 주문 쿠폰 소진 합(조회 전용 — 정산 무관).
  coalesce(o.coupon_used_qty, 0)::int     as coupon_used_qty
from rider_profiles rp
join profiles p on p.id = rp.id
left join (
  select
    rider_id,
    count(*) filter (where status = 'COMPLETED')                                            as completed_count,
    sum(coalesce(final_kg, measured_kg, 0)) filter (where status = 'COMPLETED')             as collected_kg,
    -- [14 J4] CASH도 상계 대상(현장에서 차액만 주고받는다). 부호를 살려 net<0(라이더가 점주에게
    -- 지불)이 음수로 드러나게 한다. 레거시(net_amount null)는 cash_paid_amount 폴백.
    sum(coalesce(net_amount, cash_paid_amount)) filter (where status = 'COMPLETED' and coalesce(payout_method,'CASH') = 'CASH')  as cash_paid,
    -- [14 J4] POINT 실지급(minted) = net(>0). 레거시(net_amount null=상계 없음)는 cash_paid_amount 폴백.
    sum(case when net_amount is null then cash_paid_amount else greatest(net_amount, 0) end)
      filter (where status = 'COMPLETED' and payout_method = 'POINT')                        as point_paid,
    -- [17 Q5] 완료 주문의 coupon_cost 합(수락 게이트 소진량의 완료 확정분). 헤더 주석 참조 —
    -- coupon_ledger 경유 금지(좌상 RLS 0행), pickup_orders 경유가 유일 경로.
    sum(coupon_cost) filter (where status = 'COMPLETED')                                    as coupon_used_qty
  from pickup_orders
  where rider_id is not null
  group by rider_id
) o on o.rider_id = rp.id
left join v_referral_stats rs on rs.referrer_rider_id = rp.id;

-- create or replace view는 기존 ACL을 보존하지만, 이 파일 단독 적용(핫픽스) 멱등성을 위해 명시.
grant select on v_dealer_rider_stats to authenticated;
