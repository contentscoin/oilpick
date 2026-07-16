#!/usr/bin/env bash
# OilPick 08 신모델(현장 지급수단 — 현금·포인트) + 09 레퍼럴 프로덕션 컷오버 — Supabase 단계 원샷 실행.
# 08-payout-pivot.md·09-referral.md §배포 / DEPLOY.md §1-0 기준. CEO 로컬 터미널에서 실행한다:
#
#   supabase login          # 최초 1회(브라우저 인증)
#   bash scripts/deploy-cutover.sh
#
# 이후 수동 단계(스크립트 말미에 다시 안내):
#   ⓑ 잔존 주문 드레인(admin 웹) → ⓓ Vercel 3앱 재배포(DEPLOY.md §2) → ⓔ coupon-* 함수 삭제(아래 안내)

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-dbvgxuevhmyoprafarnh}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "✗ supabase CLI가 없어요 — https://supabase.com/docs/guides/cli 설치 후 재실행." >&2
  exit 1
fi

echo "── 1/4 프로젝트 링크 ($PROJECT_REF)"
supabase link --project-ref "$PROJECT_REF"

echo "── 2/4 마이그레이션 상태 확인"
supabase migration list
echo ""
read -r -p "위 목록에서 Remote에 없는(Local만 있는) 마이그레이션을 적용합니다. 계속할까요? [y/N] " yn
if [[ "${yn,,}" != "y" ]]; then
  echo "중단했어요. 과거 적용분이 CLI 기록에 없다면(수동 적용) supabase migration repair가 필요할 수 있어요."
  exit 1
fi

echo "── 3/4 DB 마이그레이션 적용 (supabase db push — 08 payout_method·fn_transition_order + 09 referrals·RPC·뷰 포함)"
supabase db push

echo "── 4/4 Edge Functions 배포 (order-* + withdraw-*/point-adjust + 09 referral-code/referral-attach 동시 배포)"
supabase functions deploy

cat <<'NEXT'

✅ Supabase 컷오버 완료. 남은 수동 단계(08-payout-pivot.md §배포 체크리스트):

ⓑ 잔존 주문 드레인 — admin 웹에서 진행중(REQUESTED~DISPUTED) 쿠폰 주문(coupon_cost not null)
   0건 확인. 있으면 완결/취소(잔존분의 쿠폰 소진·환급은 RPC 레거시 분기가 처리).

ⓓ Vercel 3앱 재배포 — main 병합 시 자동(DEPLOY.md §2). 순서: rider → user → admin.
   · 공통 env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (VITE_PG_PROVIDER는 불필요 — 무시됨)
   · 초기 데이터: 시세 tick 1건 필수(admin 웹 시세 관리). 쿠폰 단가는 폐기 — 불필요.

ⓔ coupon-* 함수 삭제(앱 배포 확인 후 마지막 — 가동 중 구버전 앱 파손 방지):
   supabase functions delete coupon-purchase-intent
   supabase functions delete coupon-purchase-confirm
   supabase functions delete coupon-purchase-return
   supabase functions delete coupon-refund
   supabase functions delete coupon-adjust
   supabase functions delete coupon-price-set
   (DB의 쿠폰 RPC·테이블·원장 데이터는 회계 기록으로 보존 — 내리지 않는다.)

ⓕ 데모 시나리오: ① 요청 → 수락 → 계량+지급수단 선택 → 점주 확인(포인트 적립) → 지갑 출금 신청 → admin 처리.
   ② (09) 라이더 "내 추천" 링크 복사 → 신규 점주 /ref/:code 가입 → 첫 수거 완료 → 점주 REFERRAL +5,000P
      적립·라이더 실적 활성화·admin /referrals 퍼널 반영.

(선택, 09) 레퍼럴 링크 도메인이 app.oilpick.kr이 아니면:
   supabase secrets set REFERRAL_BASE_URL="https://<user 앱 도메인>"
(선택) PG 시크릿 정리: supabase secrets unset PG_PROVIDER TOSS_SECRET_KEY KOEM_MID KOEM_API_KEY
NEXT
