-- [16 L6] 좌상 관할 운영 관제 뷰 — 14 §2-5가 예약한 설계("운영 가시성이 필요해지면 재무 컬럼
-- 제외 security_invoker 뷰로 별도")의 실행. docs/spec/16-ops-convenience.md §5-1.
--
-- 진행중(ACCEPTED/ARRIVED/DISPUTED) 주문의 **비재무 최소 컬럼**만 노출한다 — cash_paid_amount·
-- net_amount·purchase_amount·snapshot_* 등 재무 컬럼은 뷰에 없다(DB가 컬럼 집합을 강제 —
-- pgTAP columns_are로 고정). 좌상 행 필터는 기존 스냅샷 RLS p_orders_read_by_dealer
-- (dealer_id = auth.uid(), 20260724000006)가 담당하고 admin은 is_admin() 정책으로 전체.
-- 좌상은 조회 전용 — 상태 액션 없음(13 D3 불변). 라이더 실시간 위치는 당사자 전용(14 §6-2) 유지.
--
-- 라이더 표시명: p_profiles_read_own_riders(13 I1)는 **현재 소속** 라이브조인이라, 재배정된
-- 라이더의 과거 스냅샷 주문에서는 profiles 행이 RLS에 걸러져 null이 된다 → left join +
-- rider_id 축약 폴백(이름 누출 없이 식별만). pgTAP 16 스위트가 이 케이스를 고정한다.

create view v_dealer_active_orders with (security_invoker = true) as
select
  o.id                                                        as order_id,
  o.status,
  o.order_kind,
  o.rider_id,
  coalesce(p.display_name, '라이더 ' || left(o.rider_id::text, 8)) as rider_name,
  o.pickup_address,
  o.purchase_requested_cans,
  o.delivered_cans,
  o.accepted_at,
  o.arrived_at,
  o.created_at
from pickup_orders o
left join profiles p on p.id = o.rider_id
where o.status in ('ACCEPTED', 'ARRIVED', 'DISPUTED');

comment on view v_dealer_active_orders is
  '[16 L6] 좌상 관제(재무 컬럼 제외, 14 §2-5 예약 실행). invoker — 좌상=스냅샷 RLS 자기 귀속분, admin=전체';

-- 04-tasks T4 체크 관례: 신규 릴레이션 GRANT 누락 금지(14 §10-3 ① pickup_items 재발 방지).
grant select on v_dealer_active_orders to authenticated;
