-- [16 L9] 라이더 본인 정산 현황 뷰 — v_my_payout_daily. docs/spec/16-ops-convenience.md §6-2.
--
-- 배경: 포인트 지급분의 라이더-플랫폼 정산은 오프라인인데, 유일한 대사 근거
-- v_rider_payout_daily는 is_admin() 게이트라 라이더 본인이 자기 정산 대기 금액을 볼 수 없다
-- (08 P5 리스크 레지스터 [중]). 본인 스코프 뷰를 **신설**한다 — 기존 admin 뷰는 불변.
--
-- ⚠️ 미러 기준은 20260724000011의 **net 기준 재정의본**이다(L-D 심사 반영) — 01-db-schema에
-- 보이는 구판(gross) 정의를 복제하면 14 §10-5가 지배적 원인으로 지목한 gross/net 드리프트를
-- 라이더 화면에서 재도입한다. point_amount는 실제 EARN 발행액과 일치(POINT net>0만),
-- point_spent_amount는 신유 대금 회수분(net<0). 라이더 지갑·원장 발행 없음(08 P5) 원칙 불변 —
-- 조회 전용 대사 근거일 뿐이다.

create view v_my_payout_daily
  with (security_invoker = true)
as
select
  completed_at::date as day,
  count(*)           as completed_count,
  coalesce(sum(final_kg),0) as total_kg,
  -- CASH: 부호 보존(음수 = 라이더가 점주에게서 받은 상계 차액 — 정산 무관, 참고 표기).
  coalesce(sum(coalesce(net_amount, cash_paid_amount)) filter (where coalesce(payout_method,'CASH')='CASH'),0)::int as cash_amount,
  -- POINT 발행(EARN)분 = 플랫폼이 라이더에게 정산할 금액(오프라인 청구 근거).
  coalesce(sum(greatest(coalesce(net_amount, cash_paid_amount), 0)) filter (where payout_method='POINT'),0)::int    as point_amount,
  -- POINT 회수분(신유 대금 차감) — 참고 표기.
  coalesce(sum(greatest(-coalesce(net_amount, cash_paid_amount), 0)) filter (where payout_method='POINT'),0)::int   as point_spent_amount
from pickup_orders
where status = 'COMPLETED'
  and completed_at is not null
  and rider_id = (select auth.uid())   -- 본인 스코프(invoker — 기저 RLS 위에서 이중 한정)
group by 1;

comment on view v_my_payout_daily is
  '[16 L9] 라이더 본인 일별 지급 실적(net 기준 — 20260724000011 미러). 오프라인 정산 대사 근거, 원장 무관';

grant select on v_my_payout_daily to authenticated;
