-- pgTAP: 라이더 다중 콜 수락(최대 3건, 20260726000001).
-- 이전 불변식은 "라이더당 활성 1건"(유니크 인덱스)이었다. 인덱스를 걷어내고 RPC의
-- advisory lock + 카운트 체크로 상한을 강제하도록 바꿨으므로, 그 방어가 실제로 도는지 고정한다.
create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ── 픽스처: 라이더 1 + 점주 1 + REQUESTED 주문 5건 ────────────────────────
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', id::text||'@t', now(), now()
from (values
  ('ab000000-0000-0000-0000-000000000001'::uuid),
  ('ab000000-0000-0000-0000-000000000101'::uuid)
) as v(id);
insert into profiles (id, role, phone, display_name) values
  ('ab000000-0000-0000-0000-000000000001','supplier','0','점주'),
  ('ab000000-0000-0000-0000-000000000101','rider','0','라이더');
insert into supplier_profiles (id, biz_number, store_name, address, location) values
  ('ab000000-0000-0000-0000-000000000001','b','s','a',ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography);
insert into rider_profiles (id, biz_number, vehicle_number, verify_status, is_online, last_location) values
  ('ab000000-0000-0000-0000-000000000101','b','01','APPROVED',true,ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography)
  on conflict (id) do nothing;

insert into pickup_orders (id, supplier_id, status, requested_kg, pickup_address, pickup_location, snapshot_price_per_kg)
select ('ab000000-0000-0000-0000-00000000020' || n)::uuid,
       'ab000000-0000-0000-0000-000000000001','REQUESTED',10,'a',
       ST_SetSRID(ST_MakePoint(127,37.5),4326)::geography,700
from generate_series(1,5) as n;

-- ── (1) 1~3건째 수락은 성공 ───────────────────────────────────────────────
select lives_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000201','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  '1건째 수락 성공');
select lives_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000202','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  '2건째 수락 성공 — 구 유니크 인덱스였다면 여기서 막혔다');
select lives_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000203','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  '3건째 수락 성공(상한)');
select is((select count(*)::int from pickup_orders
            where rider_id='ab000000-0000-0000-0000-000000000101' and status='ACCEPTED'),
          3, '활성 3건 보유');

-- ── (2) 4건째는 상한 초과로 거부 ─────────────────────────────────────────
select throws_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000204','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  'RIDER_TOO_MANY_ACTIVE', '4건째 수락은 상한 초과로 거부');
select is((select status::text from pickup_orders where id='ab000000-0000-0000-0000-000000000204'),
          'REQUESTED', '거부된 주문은 REQUESTED로 남는다(부분 적용 없음)');

-- ── (3) DISPUTED도 상한에 포함된다(라이더가 붙들고 있는 작업) ─────────────
update pickup_orders set status='DISPUTED' where id='ab000000-0000-0000-0000-000000000201';
select throws_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000204','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  'RIDER_TOO_MANY_ACTIVE', 'DISPUTED 1 + ACCEPTED 2 = 3건도 상한');

-- ── (4) 한 건을 종결하면 다시 수락 가능 ──────────────────────────────────
update pickup_orders set status='CANCELLED' where id='ab000000-0000-0000-0000-000000000201';
select lives_ok(
  $$ select fn_transition_order('ab000000-0000-0000-0000-000000000204','ACCEPT','ab000000-0000-0000-0000-000000000101','rider') $$,
  '종결 후 빈 자리에 새 콜 수락 가능');

-- ── (5) 매칭도 상한 미만 라이더를 계속 후보로 포함한다 ────────────────────
-- 현재 활성 3건(202,203,204) → 상한 도달이므로 후보에서 빠져야 한다.
select is((select count(*)::int from fn_find_eligible_riders(37.5, 127, 10)),
          0, '활성 3건 라이더는 브로드캐스트 후보에서 제외');

select * from finish();
rollback;
