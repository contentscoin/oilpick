-- Supabase 런타임 shim — 로컬 pgTAP 실행 전용(저장소에 커밋하지 않음).
-- 마이그레이션이 전제하는 Supabase 제공 객체만 최소 재현한다.

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ── 롤 ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin nologin noinherit bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant anon, authenticated, service_role to postgres;

-- ── auth 스키마 ────────────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  created_at timestamptz,
  updated_at timestamptz
);

-- Supabase 원본과 동일한 해석 순서(claim.sub 우선 → claims JSON의 sub).
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- ── storage 스키마 ─────────────────────────────────────────────────────
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- 경로 '{orderId}/file.jpg' → {orderId, file.jpg}
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable
as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts,1)-1];
end $$;

-- ── Realtime publication ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── Supabase 기본 권한(실 스택 재현) ────────────────────────────────────────
-- Supabase 로컬/호스팅 DB는 public 스키마에 대해 default privileges로 anon·authenticated·
-- service_role에 함수 EXECUTE를 자동 부여한다. 이것 때문에 마이그레이션의
-- `revoke all on function ... from public`만으로는 authenticated의 EXECUTE가 사라지지 않는다
-- (PUBLIC 권한과 직접 부여분은 별개). 이 shim이 그걸 재현하지 않아 03_privilege_guards가
-- 로컬에서만 통과하고 CI에서 실패했다 — 실 환경과 어긋나지 않도록 여기서 동일하게 부여한다.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
