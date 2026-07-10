#!/usr/bin/env bash
# OilPick 신모델(수거쿠폰) 프로덕션 컷오버 — Supabase 단계(ⓐⓑⓔ + 시크릿) 원샷 실행.
# 07-pivot-plan.md 배포 체크리스트 / DEPLOY.md §1 기준. CEO 로컬 터미널에서 실행한다:
#
#   supabase login          # 최초 1회(브라우저 인증)
#   bash scripts/deploy-cutover.sh
#
# 이후 수동 단계(스크립트 말미에 다시 안내):
#   ⓒ 초기 데이터(SQL Editor): 쿠폰 단가 2,000원 tick (+선택: 데모 라이더 20장 선지급) — DEPLOY.md §1-1
#   ⓓ 잔존 주문 드레인(admin 웹) → ⓕ Vercel 3앱 배포(DEPLOY.md §2) → ⓖ 구모델 함수 삭제(아래 안내)
#
# 코엠 실연동 전까지 결제는 데모 모드(PG_PROVIDER=demo — 실 과금 없음, 시연 전용. DEPLOY.md 경고).

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-dbvgxuevhmyoprafarnh}"
PG_PROVIDER_VALUE="${PG_PROVIDER_VALUE:-demo}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI가 없어요 — https://supabase.com/docs/guides/cli 설치 후 재실행." >&2
  exit 1
fi

echo "── 1/5 프로젝트 링크 ($PROJECT_REF)"
supabase link --project-ref "$PROJECT_REF"

echo "── 2/5 마이그레이션 상태 확인"
supabase migration list
echo ""
read -r -p "위 목록에서 Remote에 없는(Local만 있는) 마이그레이션을 적용합니다. 계속할까요? [y/N] " yn
if [[ "${yn,,}" != "y" ]]; then
  echo "중단했어요. 과거 적용분이 CLI 기록에 없다면(수동 적용) supabase migration repair가 필요할 수 있어요."
  exit 1
fi

echo "── 3/5 DB 마이그레이션 적용 (supabase db push)"
supabase db push

echo "── 4/5 Edge Functions 배포 (verify_jwt 등은 supabase/config.toml)"
supabase functions deploy

echo "── 5/5 시크릿: PG_PROVIDER=$PG_PROVIDER_VALUE"
supabase secrets set PG_PROVIDER="$PG_PROVIDER_VALUE"

cat <<'NEXT'

✅ Supabase 컷오버 완료. 남은 수동 단계:

ⓒ 초기 데이터 — 대시보드 SQL Editor에서 1회 (DEPLOY.md §1-1의 SQL 그대로):
   · 쿠폰 단가 tick 2,000원 (coupon_price_ticks — admin id를 created_by로)
   · (선택) 데모 라이더 쿠폰 20장 선지급 (fn_charge_coupon ADJUST)
   · admin 계정·시세 tick·집하장은 구모델 운영분이 이미 있으면 생략

ⓓ 잔존 주문 드레인 — admin 웹에서 진행중 구모델 주문 완결/취소

ⓕ Vercel 3앱 — 같은 repo를 3번 import, Root Directory만 다르게 (DEPLOY.md §2):
   · apps/admin → admin.oilpick.kr / apps/user → app.oilpick.kr / apps/rider → rider.oilpick.kr
   · 공통 env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   · rider에만 추가: VITE_PG_PROVIDER=demo  ← 서버 PG_PROVIDER와 반드시 짝
   · 배포 후 Supabase Auth → URL Configuration에 세 도메인 등록

ⓖ 구모델 함수 삭제(앱 확인 후 마지막):
   supabase functions delete withdraw-request
   supabase functions delete withdraw-process
   supabase functions delete point-adjust

코엠 실연동 전환 시: PG_PROVIDER=koem + KOEM_MID/KOEM_API_KEY 시크릿 + rider env 교체 (DEPLOY.md §1).
NEXT
