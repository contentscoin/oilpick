-- T13 마감: Supabase 보안 advisor(function_search_path_mutable) 경고 0건화.
--
-- 배경: Supabase security advisor는 search_path가 고정되지 않은 함수를 경고한다. 특히
-- SECURITY DEFINER 함수는 search_path 하이재킹(호출자가 임시 스키마에 동명 객체를 심어
-- 함수 내부 참조를 가로채는 공격)에 취약하므로 search_path를 명시적으로 고정해야 한다.
-- 기존 RPC(fn_post_ledger/fn_transition_order/fn_request_withdraw/fn_process_withdraw/
-- fn_find_eligible_riders/fn_point_lat_lng)는 이미 `set search_path = public`으로 생성됐으나,
-- init(20260704000001)의 is_admin·forbid_ledger_mutation과 rider_card 정책
-- (20260704000010)의 fn_is_assigned_rider_of_caller 3개가 누락돼 있었다(로컬 advisor 실측 확인).
--
-- CREATE OR REPLACE로 재정의하지 않고 ALTER FUNCTION ... SET으로 속성만 추가한다(본문/의존
-- 정책 재생성 불필요, 멱등). 01-db-schema.sql(단일 진실)의 해당 함수 정의도 동기화했다.

alter function public.is_admin() set search_path = public;
alter function public.forbid_ledger_mutation() set search_path = public;
alter function public.fn_is_assigned_rider_of_caller(uuid) set search_path = public;
