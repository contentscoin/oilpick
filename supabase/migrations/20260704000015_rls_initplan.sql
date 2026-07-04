-- T13 마감: Supabase 성능 advisor(auth_rls_initplan) 경고 0건화.
--
-- 배경: RLS 정책에서 auth.uid()/auth.jwt() 등을 직접 호출하면 Postgres가 각 행마다 재평가한다.
-- `(select auth.uid())`로 감싸면 플래너가 InitPlan으로 한 번만 평가해 캐시하므로, 행 수가 많은
-- 테이블(pickup_orders/point_ledger/notifications 등)에서 스캔 비용이 크게 줄어든다. 값 자체는
-- 동일하므로(현재 세션의 uid) 보안 의미는 변하지 않는다 — Supabase 공식 권장 리팩터.
--
-- ALTER POLICY로 표현식만 교체한다(정책 cmd/롤/이름 유지, drop+create 불필요). is_admin()·
-- fn_is_assigned_rider_of_caller()는 이미 stable security definer 함수 호출이라 InitPlan으로
-- 접히므로 그대로 두고, 정책 안에 남은 직접 auth.uid() 호출만 (select auth.uid())로 감싼다.
-- 01-db-schema.sql(단일 진실)의 정책 정의도 동기화했다.

-- depots
alter policy p_depot_read on depots using ((select auth.uid()) is not null);

-- notifications
alter policy p_noti_read on notifications using (user_id = (select auth.uid()));
alter policy p_noti_update on notifications using (user_id = (select auth.uid()));

-- order_events
alter policy p_events_read on order_events using (
  is_admin() or exists (
    select 1 from pickup_orders o
    where o.id = order_events.order_id
      and ((o.supplier_id = (select auth.uid())) or (o.rider_id = (select auth.uid())))
  )
);

-- pickup_orders
alter policy p_order_open_calls on pickup_orders using (
  status = 'REQUESTED'::order_status and exists (
    select 1 from rider_profiles r
    where r.id = (select auth.uid()) and r.verify_status = 'APPROVED'::verify_status
  )
);
alter policy p_order_rider on pickup_orders using (rider_id = (select auth.uid()));
alter policy p_order_supplier on pickup_orders using ((supplier_id = (select auth.uid())) or is_admin());

-- point_ledger
alter policy p_ledger_read on point_ledger using ((user_id = (select auth.uid())) or is_admin());

-- profiles
alter policy p_profiles_insert on profiles with check ((id = (select auth.uid())) and (role <> 'admin'::user_role));
alter policy p_profiles_self on profiles using ((id = (select auth.uid())) or is_admin());
alter policy p_profiles_update on profiles using (id = (select auth.uid()));

-- rider_profiles
alter policy p_rider_self on rider_profiles using ((id = (select auth.uid())) or is_admin());

-- supplier_profiles
alter policy p_sup_self on supplier_profiles using ((id = (select auth.uid())) or is_admin());

-- withdrawals
alter policy p_withdraw_read on withdrawals using ((user_id = (select auth.uid())) or is_admin());
