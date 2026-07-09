-- pgTAP: [07 F12] cs_tickets RLS. 본인 insert 허용 / author·role 위조 차단 / 타인 select 차단 /
-- admin 전체 select + (답변·상태) update / 비-admin update 차단을 검증한다.
-- RLS는 set local role authenticated + request.jwt.claims sub 로 시뮬레이션한다(03_privilege_guards 패턴).
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 픽스처(테스트 러너 = postgres, RLS/guard 트리거 예외) ──────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('a0000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','csup@t.local',now(),now()),
  ('a0000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','crid@t.local',now(),now()),
  ('a0000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cadm@t.local',now(),now()),
  ('a0000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','csup2@t.local',now(),now());
insert into profiles (id, role, phone, display_name) values
  ('a0000000-0000-0000-0000-000000000001','supplier','010','점주'),
  ('a0000000-0000-0000-0000-000000000002','rider','011','라이더'),
  ('a0000000-0000-0000-0000-000000000003','admin','012','관리자'),
  ('a0000000-0000-0000-0000-000000000004','supplier','013','점주2');

-- 1) 본인 insert 허용(author=본인, role 일치)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into cs_tickets (id, author_id, role, category, title, body)
  values ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','supplier','ORDER','제목','본문');
reset role;
select is((select count(*)::int from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), 1,
          '본인 insert 허용(author=본인, role 일치)');

-- 2) author 위조 차단(author_id != auth.uid())
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ insert into cs_tickets (author_id, role, category, title, body)
     values ('a0000000-0000-0000-0000-000000000004','supplier','ORDER','x','y') $$,
  '42501', NULL, 'author_id 위조 insert는 RLS with check로 차단');
reset role;

-- 3) role 위조 차단(role != 본인 profiles.role)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ insert into cs_tickets (author_id, role, category, title, body)
     values ('a0000000-0000-0000-0000-000000000001','rider','ORDER','x','y') $$,
  '42501', NULL, 'role 위조(supplier가 rider로) insert는 RLS with check로 차단');
reset role;

-- 4) 타인 select 차단(S2는 S의 티켓을 못 봄)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), 0,
          '타인(S2)은 S의 티켓 select 불가');
reset role;

-- 5) 본인 select 허용
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), 1,
          '본인은 자기 티켓 select 가능');
reset role;

-- 6) admin 전체 select
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), 1,
          'admin은 전체 티켓 select 가능(is_admin 게이트)');
reset role;

-- 7) admin update(답변·상태만) 가능
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
update cs_tickets set admin_reply='처리했어요', status='RESOLVED', resolved_at=now()
  where id='c0000000-0000-0000-0000-000000000001';
reset role;
select is((select admin_reply from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), '처리했어요',
          'admin은 admin_reply update 가능');
select is((select status::text from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), 'RESOLVED',
          'admin status 전이(RESOLVED) 반영');

-- 8) 비-admin(작성자 본인) update 차단(RLS USING is_admin()=false → 0행, 값 불변)
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update cs_tickets set admin_reply='위조답변' where id='c0000000-0000-0000-0000-000000000001';
reset role;
select is((select admin_reply from cs_tickets where id='c0000000-0000-0000-0000-000000000001'), '처리했어요',
          '작성자 본인도 admin_reply update 불가(RLS USING is_admin())');

select * from finish();
rollback;
