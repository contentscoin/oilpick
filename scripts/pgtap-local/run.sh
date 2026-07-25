#!/usr/bin/env bash
# Docker 없이 pgTAP 전체 스위트를 실행하는 폴백 하네스.
#
# 정식 경로는 `supabase test db`(Docker 필요)다. 이 스크립트는 Docker 데몬을 못 쓰는 환경
# (CI 러너 제약·컨테이너 안 등)에서 마이그레이션+테스트를 검증하기 위한 대체 수단이며,
# 로컬 PostgreSQL 클러스터를 임시로 띄워 Supabase 런타임 객체를 shim으로 재현한다.
#
# 사전 요구: postgresql-16, postgresql-16-postgis-3, postgresql-16-pgtap
#   sudo apt-get install -y postgresql-16 postgresql-16-postgis-3 postgresql-16-pgtap
#
# 사용: bash scripts/pgtap-local/run.sh
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/oilpick-pgdata}
PGSOCK=${PGSOCK:-/tmp/oilpick-pgrun}
PGPORT=${PGPORT:-55432}
DB=oilpick_test
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$PGBIN:$PATH"

cleanup() { su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ 임시 클러스터 기동"
rm -rf "$PGDATA"; mkdir -p "$PGDATA" "$PGSOCK"; chown -R postgres:postgres "$PGDATA" "$PGSOCK"
su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null 2>&1
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-k $PGSOCK -p $PGPORT -c listen_addresses=' -l /tmp/oilpick-pg.log start" >/dev/null
sleep 2

PSQL="psql -h $PGSOCK -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
createdb -h "$PGSOCK" -p "$PGPORT" -U postgres "$DB"
# config.toml의 extra_search_path = ["public","extensions"]와 동일하게 맞춘다.
$PSQL -d "$DB" -c "alter database $DB set search_path = public, extensions;"

echo "▶ Supabase shim + pgtap"
$PSQL -d "$DB" -f "$ROOT/scripts/pgtap-local/supabase-shim.sql" >/dev/null
$PSQL -d "$DB" -c "create schema if not exists extensions;
  create extension if not exists pgtap with schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant execute on all functions in schema extensions to anon, authenticated, service_role;"

echo "▶ 마이그레이션 적용"
n=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out=$($PSQL -d "$DB" -f "$f" 2>&1); then
    echo "❌ $(basename "$f")"; echo "$out" | grep -E "ERROR" | head -5; exit 1
  fi
  n=$((n+1))
done
echo "  ✅ ${n}건 적용"

echo "▶ pgTAP"
fail=0
for f in "$ROOT"/supabase/tests/*.sql; do
  res=$(psql -h "$PGSOCK" -p "$PGPORT" -U postgres -d "$DB" -t -A -f "$f" 2>&1)
  planned=$(echo "$res" | grep -oE "^1\.\.[0-9]+" | cut -d. -f3)
  okc=$(echo "$res" | grep -cE "^ok [0-9]+" || true)
  nokc=$(echo "$res" | grep -cE "^not ok [0-9]+" || true)
  errc=$(echo "$res" | grep -cE "^psql:.*ERROR:" || true)
  if [ "$nokc" -eq 0 ] && [ "$errc" -eq 0 ] && [ "$okc" = "$planned" ]; then
    printf "  ✅ %-34s %s/%s\n" "$(basename "$f")" "$okc" "$planned"
  else
    printf "  ❌ %-34s ok=%s notok=%s err=%s planned=%s\n" "$(basename "$f")" "$okc" "$nokc" "$errc" "$planned"
    echo "$res" | grep -E "^not ok|^# +(caught|wanted|Failed)|ERROR:" | head -8
    fail=$((fail+1))
  fi
done
[ $fail -eq 0 ] && echo "🎉 pgTAP 전체 GREEN" || { echo "실패 ${fail}건"; exit 1; }
