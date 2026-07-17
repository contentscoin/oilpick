-- [08 G2-①③④] 현장 지급수단 피벗 — payout_method 스키마 + 집계 뷰 개정.
--
-- 근거: docs/spec/08-payout-pivot.md P2·P3·P5, 00-domain.md 상태머신 표.
--  - pickup_orders.payout_method: 라이더가 SUBMIT_MEASURE에서 선택하는 지급수단.
--    레거시(07 현금 전용·구모델) 행은 null — 완료 시 CASH로 간주(coalesce, 08 P3).
--  - cash_paid_amount는 "확정 지급액"으로 의미 확장(CASH=현금 원, POINT=포인트 P. 1P=1원).
--    컬럼명 변경 금지(레거시 보존 원칙) — 기존 소비처(뷰·앱)와 하위호환.
--  - v_pickup_stats_daily: CREATE OR REPLACE는 기존 컬럼(day/completed_count/total_kg/total_cash)
--    뒤에 컬럼 추가만 허용 — total_cash는 "총 지급액"으로 의미 확장하고 수단별 분리 컬럼을 덧붙인다.
--  - v_rider_payout_daily 신설: 라이더별·일별 지급 실적(수단 분리). 포인트 지급분은 플랫폼이
--    점주에게 부담(EARN 발행)하므로 라이더-플랫폼 오프라인 정산·청구의 유일한 대사 근거(08 P5).
--
-- 순수 추가(기존 동작 무영향): 컬럼은 nullable, 뷰는 컬럼 append + 신설.

-- ===== ① 지급수단 enum + 컬럼 =====
create type payout_method as enum ('CASH', 'POINT');

alter table pickup_orders add column payout_method payout_method;

comment on column pickup_orders.payout_method is
  '현장 지급수단(08 P2). SUBMIT_MEASURE에서 라이더가 선택. null=레거시(완료 시 CASH 간주).';
comment on column pickup_orders.cash_paid_amount is
  '확정 지급액(08 P3). payout_method=POINT면 포인트 P(1P=1원), 그 외 현금 원. round(final_kg × snapshot_price_per_kg).';

-- ===== ③ v_pickup_stats_daily — 수단별 분리 컬럼 append =====
-- 기존 컬럼 의미: total_cash = "총 지급액"(현금+포인트 합 — 07까지는 전액 현금이라 동치였다).
-- 신규 컬럼: coalesce(payout_method,'CASH') 기준 수단별 건수/금액. admin KPI는 신규 컬럼을 사용한다.
create or replace view v_pickup_stats_daily
  with (security_invoker = true)
as
select
  completed_at::date            as day,
  count(*)                      as completed_count,
  coalesce(sum(final_kg),0)     as total_kg,
  coalesce(sum(cash_paid_amount),0)::int as total_cash,
  coalesce(sum(cash_paid_amount) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int  as cash_amount,
  coalesce(sum(cash_paid_amount) filter (where payout_method='POINT'),0)::int                  as point_amount,
  count(*) filter (where coalesce(payout_method,'CASH')='CASH') as cash_count,
  count(*) filter (where payout_method='POINT')                 as point_count
from pickup_orders
where status='COMPLETED' and completed_at is not null and is_admin()
group by 1;

-- ===== ④ v_rider_payout_daily — 라이더별 지급 실적 (admin 전용, 08 P5) =====
-- v_coupon_sales_daily 패턴 미러: security_invoker=true + where is_admin() 게이트(비관리자 빈 결과).
create view v_rider_payout_daily
  with (security_invoker = true)
as
select
  rider_id,
  completed_at::date as day,
  count(*)           as completed_count,
  coalesce(sum(final_kg),0) as total_kg,
  coalesce(sum(cash_paid_amount) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int as cash_amount,
  coalesce(sum(cash_paid_amount) filter (where payout_method='POINT'),0)::int                 as point_amount
from pickup_orders
where status='COMPLETED' and completed_at is not null and rider_id is not null and is_admin()
group by 1, 2;

-- GRANT: 집계 뷰 선례(20260709000002:150-153) — is_admin() 게이트가 실 차단, select는 열어둔다.
grant select on v_rider_payout_daily to authenticated, anon;
