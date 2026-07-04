-- public 스키마 테이블 GRANT 보강.
--
-- 문제: 20260704000001_init.sql의 CREATE TABLE들은 role `postgres`(supabase CLI가 마이그레이션을
-- 실행하는 role)로 생성됐다. 이 로컬 스택은 db reset/seed 초기화 단계에서
-- `alter default privileges in schema public grant all on tables to postgres, anon,
-- authenticated, service_role` 이후 곧바로 `revoke select, insert, update, delete on tables
-- from anon, authenticated, service_role`을 실행해 postgres role의 향후 테이블 생성에 대한
-- 기본 권한에서 select/insert/update/delete를 제거해 둔다(트리거/참조/truncate 권한만 남음).
-- 그 결과 이 파일 이전까지는 `service_role`이 RLS를 BYPASSRLS로 우회하더라도 애초에
-- GRANT 자체가 없어 모든 테이블 접근이 "permission denied for table ..."로 막혔다
-- (T4 order-create curl 검증 중 실측: profiles SELECT가 42501로 실패).
--
-- 해결: CLAUDE.md 절대 규칙 3 "모든 테이블에 RLS 필수. service_role 키는 Edge Function에서만
-- 사용"의 전제(Edge Function은 service_role로 전체 접근 가능해야 함)를 만족시키기 위해
-- service_role에는 스키마 전체 테이블/시퀀스 CRUD를 명시적으로 GRANT한다.
-- anon/authenticated는 RLS 정책이 이미 각 테이블에 정의된 만큼만 select/insert/update
-- 권한을 부여한다(정책이 없는 테이블은 GRANT를 줘도 RLS default-deny로 계속 차단됨 —
-- pickup_orders/order_events/point_ledger/withdrawals의 insert/update가 여기 해당,
-- 02-api.md "Edge Function만 상태 전이/원장 기록" 원칙과 일치).

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- authenticated: RLS 정책이 select/insert/update를 이미 각 테이블별로 제어하므로
-- 여기서는 "정책이 존재하는 작업"만큼만 열어준다. RLS가 최종 방어선이며 이 GRANT는
-- PostgREST/service_role의 기본 권한 부재 문제를 해소하기 위함이다.
grant select, insert, update on
  profiles, supplier_profiles, rider_profiles, price_ticks, depots,
  pickup_orders, order_events, point_ledger, withdrawals, notifications
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- anon: price_ticks(전체 공개 read), depots(인증 사용자만이므로 anon은 실질적으로 RLS에서 차단)
-- 정도만 select 대상이지만, 다른 정책도 인증 전 조회 시도 자체는 허용하고 RLS가 걸러낸다.
grant select on
  profiles, supplier_profiles, rider_profiles, price_ticks, depots,
  pickup_orders, order_events, point_ledger, withdrawals, notifications
  to anon;

-- RPC 함수 EXECUTE 권한: 20260704000003_rpc.sql/20260704000004_broadcast_helper.sql이
-- `revoke all on function ... from public`을 실행했는데, 이는 실제로는 `service_role`을
-- 포함한 모든 role의 EXECUTE 권한까지 제거하는 결과였다(PUBLIC pseudo-role revoke는
-- "public을 통해 상속된 권한"을 없애며, service_role도 별도 GRANT가 없으면 실행 불가 —
-- T4 order-create curl 검증 중 실측: "permission denied for function
-- fn_find_eligible_riders"). 각 RPC 주석이 의도한 "service_role(Edge Function)에서만
-- 호출된다"를 실제로 만족시키려면 service_role에 명시적 EXECUTE GRANT가 필요하다.
grant execute on function fn_post_ledger(uuid, ledger_type, int, uuid, text, uuid, uuid) to service_role;
grant execute on function fn_transition_order(uuid, text, uuid, user_role, jsonb) to service_role;
grant execute on function fn_find_eligible_riders(double precision, double precision, int) to service_role;
grant execute on function fn_point_lat_lng(geography) to service_role;
