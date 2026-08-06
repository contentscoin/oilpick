-- [19 T10] 좌상 실적(v_dealer_rider_stats)의 **귀속 축 명시** — 좌상 데이터와 라이더 데이터
-- 불일치 수정. docs/spec/19-admin-console.md §5.
--
-- 결함(로컬 재현 확인, 2026-08-06): 집계 서브쿼리가 `where rider_id is not null`뿐이라
-- **좌상 귀속 축이 없다**. 이 뷰가 security_invoker라, 실제 필터를 RLS가 우연히 대신하고 있었다:
--   · 좌상이 조회 → p_orders_read_by_dealer(dealer_id = auth.uid() 스냅샷)가 걸러 줌 → 자기 귀속분만
--   · admin이 조회 → is_admin()으로 전 주문이 보임 → **라이더의 전 생애 실적이 현재 소속 좌상에 계상**
-- 즉 같은 뷰·같은 라이더인데 **보는 사람에 따라 값이 달라진다**.
--
-- 재현: 라이더가 좌상A 소속으로 14,000P 주문을 완료한 뒤 좌상B로 재배정
--   좌상B 시점 stats.point_paid = 0  /  admin 시점 stats.point_paid = 14,000  ← 불일치
--   (좌상A 정산 usage는 14,000P로 정상 유지 — 스냅샷 축)
--
-- 결정: **스냅샷 축으로 못 박는다** — `o.dealer_id is not distinct from rp.dealer_id`.
--   ① 정산(v_dealer_statement / v_dealer_settlement_orders)·크레딧(v_rider_credit, 18 R6)이
--      전부 pickup_orders.dealer_id 스냅샷 축이다. 실적만 다른 축이면 대사가 원천적으로 불가능하다.
--   ② 좌상이 지금까지 보던 값이 곧 이 축이다(RLS가 그렇게 걸러 왔다) → 좌상 화면 동작 변화 없음.
--      바뀌는 건 admin이 이 뷰를 읽을 때의 값뿐이며, 그게 교정 대상이다.
--   ③ `is not distinct from`: 본사 직속 라이더(dealer_id null)는 본사 직속 시절 주문(dealer_id
--      null)이 잡힌다. `=`로 쓰면 null 비교가 항상 false라 무소속 라이더 실적이 통째로 사라진다.
--
-- 남는 성질(설계상 정상 — 화면이 보완한다): 라이더가 떠나면 그 라이더 행 자체가 좌상 목록에서
-- 사라지므로, **좌상A의 과거 귀속 실적은 이 뷰로는 볼 수 없다**(정산 usage에는 남는다).
-- 좌상 콘솔이 정산 축 총계와 대사해 그 차액을 "전 소속 라이더 귀속분"으로 표기한다(19 §5).
--
-- 컬럼 순서·이름·타입 전부 보존, 집계 결합 조건만 교체(append-only 계약 유지 — 20260724000011 관례).

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
-- [19 T10] 상관 서브쿼리(lateral)로 전환 — 좌상 귀속 축을 집계 안에서 강제하기 위함.
-- 기존 group by 서브쿼리는 라이더 축만 알아 dealer 조건을 넣을 자리가 없었다.
left join lateral (
  select
    count(*) filter (where o2.status = 'COMPLETED')                                        as completed_count,
    sum(coalesce(o2.final_kg, o2.measured_kg, 0)) filter (where o2.status = 'COMPLETED')   as collected_kg,
    -- [14 J4] CASH도 상계 대상(현장에서 차액만 주고받는다). 부호를 살려 net<0(라이더가 점주에게
    -- 지불)이 음수로 드러나게 한다. 레거시(net_amount null)는 cash_paid_amount 폴백.
    sum(coalesce(o2.net_amount, o2.cash_paid_amount))
      filter (where o2.status = 'COMPLETED' and coalesce(o2.payout_method,'CASH') = 'CASH') as cash_paid,
    -- [14 J4] POINT 실지급(minted) = net(>0). 레거시(net_amount null=상계 없음)는 cash_paid_amount 폴백.
    sum(case when o2.net_amount is null then o2.cash_paid_amount else greatest(o2.net_amount, 0) end)
      filter (where o2.status = 'COMPLETED' and o2.payout_method = 'POINT')                 as point_paid,
    -- [17 Q5] 완료 주문의 coupon_cost 합. coupon_ledger 경유 금지(좌상 RLS 0행 — 20260805000001 헤더).
    sum(o2.coupon_cost) filter (where o2.status = 'COMPLETED')                              as coupon_used_qty
  from pickup_orders o2
  where o2.rider_id = rp.id
    -- [19 T10] 귀속 축: 그 라이더가 **이 좌상 소속으로 있는 동안** 낸 실적만.
    and o2.dealer_id is not distinct from rp.dealer_id
) o on true
left join v_referral_stats rs on rs.referrer_rider_id = rp.id;

comment on view v_dealer_rider_stats is
  '[13 I·19 T10] 좌상 소속 라이더 실적. 귀속 축 = pickup_orders.dealer_id 스냅샷 ∩ 현 소속(정산·크레딧과 동일 축)';

-- create or replace view는 기존 ACL을 보존하지만, 단독 적용(핫픽스) 멱등성을 위해 명시.
grant select on v_dealer_rider_stats to authenticated;
