-- [14 J1] 수거 추적 완성. docs/spec/14-fresh-oil-settlement.md §6.
--   ① arrived_at: ARRIVE 전이 시각을 1급 컬럼으로 — 타임라인 'ARRIVED' 노드의 '-' 해소.
--   ② pickup_items: 현장 바코드(+GPS) 1급 테이블 — 바코드별 역추적 질의를 가능하게 한다.
--      (원본 payload는 order_events에 영구 보존 — 이 테이블은 질의용 정규화 사본이다.)
--   ③ 라이더 실시간 위치 채널 인가: rider-location이 broadcast하는 `order:{id}:location`
--      토픽을 무인증 공개 → private(realtime.messages RLS)로 전환 — 주문 당사자만 구독.
-- 전부 순수 추가(기존 정책·컬럼·함수 불변).

-- ── ① arrived_at ─────────────────────────────────────────────────────────
alter table pickup_orders add column if not exists arrived_at timestamptz;

-- ── ② pickup_items (바코드 1급) ────────────────────────────────────────────
-- unique(order_id, barcode): 같은 주문 내 바코드 중복 방지 + SUBMIT_MEASURE replace-set 멱등축.
-- geo_lat/geo_lng/captured_at: 촬영 시점 디바이스 GPS·시각(있으면). 서버 적재 시각은 created_at.
create table if not exists pickup_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references pickup_orders(id) on delete cascade,
  rider_id uuid not null references rider_profiles(id),
  barcode text not null,
  geo_lat double precision,
  geo_lng double precision,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, barcode)
);
create index if not exists idx_pickup_items_order on pickup_items (order_id);
create index if not exists idx_pickup_items_barcode on pickup_items (barcode);

alter table pickup_items enable row level security;

-- 읽기: admin + 주문 당사자(supplier/rider). 쓰기 정책 없음 → service_role(RPC)만 적재(절대 규칙 1 미러).
create policy p_pickup_items_read on pickup_items for select using (
  is_admin()
  or exists (
    select 1 from pickup_orders o
    where o.id = pickup_items.order_id
      and (o.supplier_id = (select auth.uid()) or o.rider_id = (select auth.uid()))
  )
);

-- ── ③ 라이더 위치 실시간 채널 인가(private broadcast) ───────────────────────
-- rider-location(service_role)이 `order:{orderId}:location`로 broadcast하는 좌표를,
-- 그 주문의 당사자(supplier/rider)와 admin만 구독(SELECT)할 수 있게 한다. service_role 송신은
-- RLS 우회로 계속 가능. 무인증 공개 시 주문 UUID만 알면 GPS를 도청할 수 있던 노출을 막는다.
--
-- realtime.messages/realtime.topic()이 없는 구버전 스택에서도 마이그레이션이 전체 중단되지 않도록
-- 존재할 때만 정책을 생성한다(없으면 no-op — 채널은 종전과 동일하게 동작). 재적용 대비 drop-first.
do $$
begin
  if to_regclass('realtime.messages') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'realtime' and p.proname = 'topic'
     ) then
    execute 'drop policy if exists p_realtime_order_location_read on realtime.messages';
    -- 토픽 형태(order:{uuid}:location) + 주문 당사자 여부만으로 인가한다. extension 컬럼은
    -- realtime 버전마다 달라질 수 있어 참조하지 않는다(이 토픽엔 broadcast만 흐른다 — presence 미사용).
    execute $pol$
      create policy p_realtime_order_location_read on realtime.messages
        for select to authenticated
        using (
          (select realtime.topic()) like 'order:%:location'
          and exists (
            select 1 from public.pickup_orders o
            where o.id::text = split_part((select realtime.topic()), ':', 2)
              and (
                o.supplier_id = (select auth.uid())
                or o.rider_id = (select auth.uid())
                or public.is_admin()
              )
          )
        )
    $pol$;
  end if;
end $$;
