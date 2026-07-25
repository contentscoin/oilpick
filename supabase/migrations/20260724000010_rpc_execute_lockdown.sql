-- service_role 전용 RPC의 EXECUTE 권한을 anon/authenticated에서 실제로 회수한다.
--
-- 문제(실측): 기존 RPC 마이그레이션들은 관례적으로 `revoke all on function ... from public`
-- + `grant execute ... to service_role`을 실행해 왔다. 그러나 Supabase 스택은 초기화 단계에서
--   alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- 를 걸어 두기 때문에, postgres role이 새로 만든 함수에는 PUBLIC 경유 권한이 아니라
-- **anon/authenticated에 직접 부여된 EXECUTE ACL**(`anon=X/postgres,authenticated=X/postgres`)이
-- 붙는다. PUBLIC pseudo-role을 revoke해도 이 직접 GRANT는 남는다 —
-- 20260704000005_grants.sql이 테이블 쪽에서 겪은 것과 정확히 대칭인 함정이며, 그쪽은
-- 로컬 스택이 테이블 기본권한을 revoke해 둔 덕에 드러났지만 함수 쪽은 아무도 revoke하지 않았다.
--
-- 결과: 로그인한 아무 사용자나 PostgREST `/rest/v1/rpc/...`로 SECURITY DEFINER 재무 RPC를
-- 직접 호출할 수 있었다. fn_post_ledger(임의 포인트 발행)·fn_process_withdraw(출금 승인)·
-- fn_set_dealer_account(자기 좌상 한도 임의 설정)·fn_settle_dealer_claim(정산 완료 마킹)·
-- fn_settle_trade / fn_transition_order(상태 전이·정산 임의 실행) 전부 해당.
-- CLAUDE.md 절대 규칙 1(원장 쓰기는 Edge Function/service_role RPC에만)·규칙 2(상태 전이는
-- order-transition으로만)를 DB 권한 계층에서 무너뜨리는 구멍이었다.
-- 03_privilege_guards_test.sql은 F3a 때부터 이 조건을 단언해 왔으나 CI가 pgTAP를 완주하지
-- 못한 기간 동안 회귀가 드러나지 않았다.
--
-- 조치: public 스키마의 모든 `fn_%` 함수에서 anon/authenticated EXECUTE를 회수한다. 단
--   (1) RLS 정책 표현식에 쓰이는 헬퍼는 제외 — 정책 표현식은 **질의 주체의 권한으로** 평가되므로
--       authenticated가 EXECUTE를 잃으면 해당 테이블 조회가 통째로 42501로 실패한다.
--       (해당 4종은 원래부터 revoke 대상이 아니어서 지금도 `=X/postgres`를 유지 중이다.)
--   (2) 트리거 함수(returns trigger)는 제외 — 직접 호출 경로가 없고, 트리거 발화 시점에는
--       함수 EXECUTE 권한을 재검사하지 않는다.
-- 클라이언트 번들에는 `.rpc(` 호출이 단 한 건도 없다(apps/·packages/ 전수 확인). 모든 RPC는
-- Edge Function의 service_role 클라이언트에서만 호출되므로 회수로 깨지는 경로는 없다.

do $$
declare
  r record;
  -- RLS 정책 표현식에서 호출되는 헬퍼 — 반드시 caller가 EXECUTE 가능해야 한다.
  -- 03_privilege_guards_test.sql의 동일 allowlist와 함께 유지할 것.
  allow constant text[] := array[
    'fn_current_role',
    'fn_dealer_owns_rider',
    'fn_is_assigned_rider_of_caller',
    'fn_is_assigned_supplier_of_caller'
  ];
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'fn\_%'
       and p.prorettype <> 'pg_catalog.trigger'::regtype
       and p.proname <> all (allow)
     order by p.proname
  loop
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
  end loop;
end $$;

-- 이후 마이그레이션이 만드는 함수에도 같은 구멍이 생기지 않도록 기본 권한 자체를 닫는다.
-- (postgres role이 public 스키마에 만드는 함수 한정. 클라이언트가 직접 호출해야 하는 함수를
--  새로 만들면 그 마이그레이션에서 명시적으로 grant execute ... to authenticated 할 것.)
alter default privileges in schema public revoke execute on functions from anon, authenticated;
