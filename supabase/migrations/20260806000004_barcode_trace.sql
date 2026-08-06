-- [19 T2] 폐식용유 바코드별 유통이력 뷰. docs/spec/19-admin-console.md §1 T2.
--
-- 바코드는 폐식용유 용기(말통)의 식별자다. 같은 바코드가 회차를 달리해 여러 주문에 등장하며
-- (unique(order_id, barcode)는 "주문 내" 중복만 막는다), 따라서 유통이력 = 바코드 1개의
-- 회수 이벤트 시계열이다. pickup_items 1행 = 회수 이벤트 1건(14 J1이 이미 적재 중 —
-- 지금까지 이 데이터를 읽는 화면이 3앱 어디에도 없었다).
--
-- ⚠️ security_invoker = true인 이유(18 S1의 v_rider_credit과 반대 결론):
--   이 뷰들이 참조하는 모든 테이블의 SELECT 정책에 is_admin() 분기가 있다
--   (p_pickup_items_read / p_order_supplier / p_sup_self / p_rider_self / p_profiles_self /
--    p_dealer_settlements_read) → invoker 권한으로도 admin 조회가 붕괴하지 않는다.
--   v_rider_credit이 definer여야 했던 건 라이더가 dealer_accounts를 못 읽어 조인이 통째로
--   무너졌기 때문인데, 여기엔 그 구조가 없다. invoker면 점주·라이더가 자기 행만 보는 성질이
--   기저 RLS에서 공짜로 따라오고, 뷰가 RLS 우회 경로가 되지 않는다.
--   좌상(dealer)은 pickup_items 읽기 정책이 없어 0행 — 유통이력 메뉴는 admin 전용(19 §1 T2).
--
-- 순수 추가: 테이블·정책·함수 무변경, 조회 전용(쓰기 정책 없음 — 절대 규칙 1 미러).

-- ── ① v_barcode_trace: 회수 이벤트 1건 = 1행(주문·매장·라이더·좌상·정산 연결) ──
create or replace view v_barcode_trace with (security_invoker = true) as
select
  pi.barcode,
  pi.id                     as item_id,
  pi.order_id,
  pi.rider_id,
  rp.display_name           as rider_name,
  r.vehicle_number,
  o.supplier_id,
  sp.store_name,
  o.pickup_address,
  o.dealer_id,
  dp.display_name           as dealer_name,
  o.status                  as order_status,
  o.order_kind,
  o.measured_kg,
  o.final_kg,
  o.payout_method,
  o.cash_paid_amount,
  o.purchase_amount,
  o.net_amount,
  o.dealer_settlement_id,
  ds.status                 as settlement_status,
  pi.photo_url,
  pi.geo_lat,
  pi.geo_lng,
  pi.captured_at,
  pi.created_at             as recorded_at,
  -- 정렬 축: 디바이스 촬영 시각 우선, 없으면 서버 적재 시각(레거시·사진 없는 등록).
  coalesce(pi.captured_at, pi.created_at) as seen_at,
  o.created_at              as order_created_at,
  o.completed_at
from pickup_items pi
join pickup_orders o          on o.id = pi.order_id
left join supplier_profiles sp on sp.id = o.supplier_id
left join rider_profiles r     on r.id = pi.rider_id
left join profiles rp          on rp.id = pi.rider_id
left join profiles dp          on dp.id = o.dealer_id
left join dealer_settlements ds on ds.id = o.dealer_settlement_id;

comment on view v_barcode_trace is
  '[19 T2] 바코드 유통이력 — 회수 이벤트 1건=1행(주문/매장/라이더/좌상/정산 연결). invoker(admin=전체, 당사자=본인분)';

-- ── ② v_barcode_summary: 바코드 1개 = 1행 집계 + 최근 회수 ──
-- last_order_id/last_rider_id는 목록에서 "최근 어디서 걷혔나"를 한 번의 조회로 붙이기 위한 축.
create or replace view v_barcode_summary with (security_invoker = true) as
with agg as (
  select
    barcode,
    count(*)::int                                   as pickup_count,
    count(distinct order_id)::int                   as order_count,
    count(distinct rider_id)::int                   as rider_count,
    min(coalesce(captured_at, created_at))          as first_seen_at,
    max(coalesce(captured_at, created_at))          as last_seen_at
  from pickup_items
  group by barcode
),
last_item as (
  select distinct on (barcode)
    barcode, order_id, rider_id
  from pickup_items
  order by barcode, coalesce(captured_at, created_at) desc, id desc
)
select
  a.barcode,
  a.pickup_count,
  a.order_count,
  a.rider_count,
  a.first_seen_at,
  a.last_seen_at,
  l.order_id  as last_order_id,
  l.rider_id  as last_rider_id
from agg a
join last_item l on l.barcode = a.barcode;

comment on view v_barcode_summary is
  '[19 T2] 바코드별 회수 집계(횟수·최초/최근 회수·최근 주문). invoker — 기저 pickup_items RLS가 범위를 강제';

-- 04-tasks T4 체크 관례: 신규 릴레이션 GRANT 누락 금지(14 §10-3 ① pickup_items 재발 방지).
grant select on v_barcode_trace to authenticated;
grant select on v_barcode_summary to authenticated;
