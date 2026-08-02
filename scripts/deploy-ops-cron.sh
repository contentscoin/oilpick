#!/usr/bin/env bash
# [16 L] 운영편의성 고도화 프로덕션 적용 원샷 — DEPLOY.md §1-0·§1-4 기준.
# 마이그레이션 3건(20260802000001~3) + Edge Functions 배포 + cron 배선(pg_cron)까지 한 번에.
# deploy-cutover.sh와 동일하게 CEO 로컬 터미널에서 실행한다:
#
#   supabase login                                # 최초 1회(브라우저 인증)
#   SERVICE_ROLE_KEY=<service_role 키> bash scripts/deploy-ops-cron.sh
#
# 선택 env:
#   PROJECT_REF      — 기본 dbvgxuevhmyoprafarnh
#   SUPABASE_DB_URL  — 대시보드 Database 설정의 연결 문자열. 지정하면 cron SQL을 psql로
#                      직접 실행한다. 미지정이면 SQL을 출력만 하니 SQL Editor에 붙여넣는다.
#
# cron이 배선되지 않으면 L5 확인 리마인드·L8 크레딧 경보가 조용히 죽는다(16 §0-5) —
# 이 스크립트의 마지막 검증 curl까지 초록으로 끝나는지 반드시 확인할 것.

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-dbvgxuevhmyoprafarnh}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI가 없어요 — https://supabase.com/docs/guides/cli 설치 후 재실행." >&2
  exit 1
fi

echo "── 1/4 프로젝트 링크 ($PROJECT_REF)"
supabase link --project-ref "$PROJECT_REF"

echo "── 2/4 DB 마이그레이션 적용 (supabase db push — notifications.kind·v_dealer_active_orders·v_my_payout_daily)"
supabase db push

echo "── 3/4 Edge Functions 배포 (신규 confirm-remind·settlement-watch + 변경 order-transition·order-expire·dealer-claim·referral-settle + _shared)"
supabase functions deploy

echo "── 4/4 cron 배선 (order-expire 1분 · settlement-watch 15분)"
CRON_SQL=$(cat <<SQL
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 멱등: 기존 잡이 있으면 걷어내고 다시 건다(주기·키 교체 재실행 안전).
do \$\$ begin perform cron.unschedule('order-expire-every-min'); exception when others then null; end \$\$;
do \$\$ begin perform cron.unschedule('settlement-watch-15min'); exception when others then null; end \$\$;

select cron.schedule('order-expire-every-min', '* * * * *', \$JOB\$
  select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/order-expire',
    headers := '{"Authorization": "Bearer ${SERVICE_ROLE_KEY:-<SERVICE_ROLE_KEY>}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb);
\$JOB\$);
select cron.schedule('settlement-watch-15min', '*/15 * * * *', \$JOB\$
  select net.http_post(
    url := 'https://${PROJECT_REF}.supabase.co/functions/v1/settlement-watch',
    headers := '{"Authorization": "Bearer ${SERVICE_ROLE_KEY:-<SERVICE_ROLE_KEY>}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb);
\$JOB\$);

select jobname, schedule from cron.job order by jobname;
SQL
)

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  if [[ -z "${SERVICE_ROLE_KEY:-}" ]]; then
    echo "✗ SUPABASE_DB_URL로 직접 실행하려면 SERVICE_ROLE_KEY가 필요해요." >&2
    exit 1
  fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<<"$CRON_SQL"
  echo "✓ cron 배선 완료(cron.job 목록은 위 출력 참조)."
else
  echo ""
  echo "SUPABASE_DB_URL 미지정 — 아래 SQL을 대시보드 SQL Editor에 붙여넣어 실행하세요."
  [[ -z "${SERVICE_ROLE_KEY:-}" ]] && echo "(SERVICE_ROLE_KEY도 미지정이라 <SERVICE_ROLE_KEY> 자리는 직접 치환해야 해요.)"
  echo "──────────────────────────────────────────────"
  echo "$CRON_SQL"
  echo "──────────────────────────────────────────────"
fi

# 배선과 무관하게 EF 자체가 도는지 즉시 실측(DEPLOY §1-4 검증 절차).
if [[ -n "${SERVICE_ROLE_KEY:-}" ]]; then
  echo ""
  echo "── 검증: 수동 호출 1회씩 (기대: {\"ok\":true,...})"
  for fn in order-expire settlement-watch; do
    printf '%s → ' "$fn"
    curl -sS -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/${fn}" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "Content-Type: application/json" -d '{}'
    echo ""
  done
else
  echo "(SERVICE_ROLE_KEY 미지정 — 검증 curl은 건너뛰었어요. DEPLOY.md §1-4 절차로 수동 확인.)"
fi

cat <<'NEXT'

✅ 완료 체크리스트:
  · cron.job에 order-expire-every-min / settlement-watch-15min 두 잡이 보여야 함
  · 검증 curl 응답이 {"ok":true,"data":{...}} — reminded/escalated·band80Alerts/thresholdAlerts 카운트 포함
  · (선택) 도로 경로·ETA 활성화: supabase secrets set KAKAO_MOBILITY_KEY=<REST 키>
NEXT
