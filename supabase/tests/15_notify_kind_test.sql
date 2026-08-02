-- pgTAP: [16 L2] notifications.kind + dedupe 인덱스 (20260802000001).
-- 알림 dedupe 판정(sendPushDeduped)이 의존하는 스키마 계약을 고정한다 — 컬럼·nullable(레거시 행
-- 무해)·인덱스 존재. 판정 로직 자체는 순수 함수(deno test notifyDedupe.test.ts)가 커버.
create extension if not exists pgtap with schema extensions;

begin;
select plan(5);

select has_column('public', 'notifications', 'kind', 'notifications.kind 컬럼 존재');
select col_type_is('public', 'notifications', 'kind', 'text', 'kind는 text(값 집합은 core NOTIFY_KIND가 단일 진실)');
select col_is_null('public', 'notifications', 'kind', 'kind는 nullable(레거시 행=null 무해)');
select has_index('public', 'notifications', 'idx_notifications_dedupe', 'dedupe 판정 인덱스 존재');

-- kind가 있는 행 insert가 실제로 통과하는지(체크 제약을 두지 않았다는 계약).
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('ac000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nk@t',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('ac000000-0000-0000-0000-000000000001','supplier','0','점주');
select lives_ok(
  $$ insert into notifications (user_id, title, body, link, kind)
     values ('ac000000-0000-0000-0000-000000000001','t','b','/orders/x','CONFIRM_REMIND_AUTO') $$,
  '임의 kind 문자열 insert 허용(DB 체크 제약 없음 — 16 §2)');

select * from finish();
rollback;
