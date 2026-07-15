# 03. 프론트엔드 명세

> **[08 피벗]** 08-payout-pivot.md가 개정하는 화면·정보구조는 아래 각 앱 표 뒤의 "08 피벗 개정" 블록이
> 최신 진실이다(07 블록은 이력 보존 — 08과 충돌 시 08 우선). 쿠폰 관련 화면(충전/내역/단가/매출)은 전면
> 제거, 포인트 지갑·출금은 부활, 지급수단(현금/포인트) UI가 신설된다.
> **[07 피벗]** 07-pivot-plan.md가 개정하는 화면·정보구조는 아래 각 앱 표 뒤의 "07 피벗 개정" 블록에 요약(상세는 해당 F# 참조). **05-design-upgrade.md의 비범위(정보구조·라우팅 변경 금지, 신규 화면 금지)는 07이 명시적으로 override한다**(07 머리말, 08 승계).

## 모노레포 구조
```
oilpick/
├── apps/
│   ├── user/    # supplier 앱 (Capacitor id: kr.oilpick.user)
│   ├── rider/   # rider 앱 (Capacitor id: kr.oilpick.rider)
│   └── admin/   # 관리자 웹 (Vite SPA, shadcn/ui)
├── packages/
│   ├── core/    # 타입, zod 스키마, orderMachine, errorCodes, 상수, supabase 클라이언트 팩토리, 포맷터
│   ├── ui/      # 디자인 토큰 + 공용 컴포넌트 (user/rider 공유. admin은 shadcn 독립)
│   └── config/  # tsconfig, eslint, tailwind preset
├── supabase/    # migrations/, functions/
├── docs/
├── package.json (pnpm workspace), turbo.json
```

## packages/core (먼저 구현 — 모든 앱의 기반)
- `constants.ts`: `KG_PER_CAN=15`, `MIN_WITHDRAW=10000`, `BROADCAST_RADII=[3,7,15]`,
  `CALL_ACCEPT_TIMEOUT_SEC=15`, 상태 한글 라벨 맵 (`REQUESTED:'수거 요청됨'`, `ACCEPTED:'라이더 배정'`,
  `ARRIVED:'현장 도착'`, `PICKED_UP:'수거 완료'`, `DELIVERED:'배송 완료'`, `COMPLETED:'완료'`,
  `CANCELLED:'취소됨'`, `DISPUTED:'확인 중'`)
- `orderMachine.ts`: `canTransition(from: OrderStatus, action: OrderAction, role: UserRole): boolean` 순수 함수 + 전이 테이블 (00-domain.md 표 그대로)
- `schemas.ts`: 모든 API 입출력 zod 스키마 (02-api.md와 1:1)
- `format.ts`: `formatPoint(n)` → "12,345P", `formatKrw`, `formatKg` → "45.5kg", 상대시간
- `supabase.ts`: 클라이언트 팩토리 (env로 url/anon key 주입)
- `estimate.ts`: `estimateKg(cans)`, `estimatePoint(kg, pricePerKg)`
  - **[07 F7]** `estimateCash(cans, pricePerKg)` 추가(예상 현금 수령액), `estimatePoint`은 deprecated 별칭(F13에서 제거). `priceResample.ts`의 `resampleDaily(ticks, days)`(종가+캐리포워드, 07 §1-5) 신설.

## 디자인 토큰 (packages/ui/src/tokens.ts + Tailwind preset)
```ts
colors: {
  primary: { DEFAULT:'#1B7A43', dark:'#145C32', light:'#E8F5EE' },
  accent:  { DEFAULT:'#F5A623', light:'#FFF4E0' },   // 포인트/시세/CTA 전용
  up:'#E5484D', down:'#3B82F6',                       // 시세 등락
  status: { wait:'#8B8B8B', active:'#3B82F6', done:'#1B7A43', danger:'#E5484D' },
  gray: Tailwind zinc 스케일 사용
}
font: Pretendard Variable (CDN woff2), 숫자 font-variant-numeric: tabular-nums
fontSize: base 16px 미만 금지. 시세/포인트 강조 32~40px bold
spacing: 4px 그리드. 터치 타깃 최소 48px. radius: 카드 16px, 버튼 12px
```

## packages/ui 컴포넌트 (user/rider 공용)
`PriceCard`(현재가+등락+스파크라인), `OrderTimeline`(상태 스텝퍼, 세로형),
`CallCard`(거리/수량/수거비), `PointBalanceCard`(available 크게, held는 "지급 확정 대기 nP" 보조 표기),
`BigButton`(높이 56px CTA), `QtyStepper`(통/kg 토글), `BottomSheet`, `TabBar`, `Toast`,
`EmptyState`, `PhotoUploader`(카메라 촬영 전용, Capacitor Camera), `MapView`(카카오맵 래퍼),
`StatusBadge`, `LedgerList`(원장 행: 타입 한글 라벨 + 부호 색상)

- **[07 F7/F9]** `PriceChart`(순수 SVG 라인+영역, 스크럽, 기간 토글 7/30/90) 신설. `OrderTimeline` HAPPY_PATH를 `[REQUESTED,ACCEPTED,ARRIVED,COMPLETED]`로 교체(PICKED_UP/DELIVERED은 레거시 조건부). `CallCard`는 "수거비"→"쿠폰 N장 소진"+"예상 매입 지급액". `PointBalanceCard`/`LedgerList`는 쿠폰 잔액/원장으로 일반화 재사용. tokens.ts에 `surfaceDark`/차트 색/타입스케일/모션 토큰 확장.
- 차트: ~~`recharts` LineChart~~ → **[07 F7] recharts 등 라이브러리 추가 금지 — 순수 SVG `PriceChart` + `resampleDaily`(종가+캐리포워드)로 대체.** 기간 토글(7/30/90일)은 클라이언트 리샘플.
- **[08 G4]** `PriceChart` **v2 고도화**: 기간 최고/최저 마커(점+라벨), 소극 스무딩(Catmull-Rom→cubic
  bezier), y축 눈금 가이드, 마지막 값 펄스 도트, 스크럽 툴팁 전일 대비 병기 — props 하위호환.
  `PriceStatsRow`(기간 최고/최저/평균/등락률) 신설. `PayoutMethodChip`(현금/포인트 뱃지 — 주문 카드/
  상세/드로어 공용) 신설. `CallCard` 쿠폰 칩 제거(예상 매입 지급액 유지). `PointBalanceCard`/`LedgerList`
  point 변형 현역 복권(user 지갑).

## 라우팅 & 화면 스펙

### apps/user (하단 탭: 홈/수거/포인트/마이)
| 경로 | 화면 | 구현 요점 |
|---|---|---|
| `/onboarding` | U1 슬라이드 3장 | 최초 1회 (localStorage 플래그) |
| `/auth` | U2 가입/로그인 | Supabase 전화 OTP → profiles+supplier_profiles 생성. 주소는 카카오 주소검색 → 지도핀 미세조정 → lat/lng 저장 |
| `/` | U3 홈 | PriceCard(최신 tick, Realtime 구독) + QtyStepper→estimatePoint 실시간 표시 + BigButton "수거 요청하기". 진행중 주문 있으면 상단에 진행 카드 고정 |
| `/price` | U4 시세 상세 | recharts + 이력 테이블(최근 30 tick) |
| `/request` | U5 요청 3스텝 | step1 수량 / step2 주소·희망시간(기본: 프로필 주소, '지금') / step3 확인+"현장 계량 기준" 고지 → order-create 호출 → `/orders/:id` 이동 |
| `/orders/:id` | U6/U7/U8/U9 상태별 단일 화면 | status로 분기 렌더. REQUESTED: 반경 애니메이션+취소. ACCEPTED~: MapView(라이더 위치 Realtime broadcast 구독)+OrderTimeline+라이더 카드(이름/차량/인증배지/전화 tel:). ARRIVED+measured_kg 있음: 계량 확인 UI(사진 뷰어+확정 kg+포인트 미리보기+[확인][이의신청]). COMPLETED: 지급 포인트 대형 표시 |
| `/orders` | U10 이력 | 무한 스크롤 리스트 |
| `/wallet` | U11 지갑 | PointBalanceCard + LedgerList + [출금 신청] |
| `/wallet/withdraw` | U12 | 계좌 등록/표시 + 금액 입력(최소 1만P 검증) |
| `/my`, `/notifications` | U13, U14 | |

> **07 피벗 개정 (상세는 07-pivot-plan.md 참조)**
> - **U3 홈(`/`)** [F8]: 다크 일별 시세 히어로가 주인공(라벨 "오늘 매입가" + 현재가 40px + PriceChart 민트 라인 + 기간 토글). QtyStepper·예상포인트 섹션 제거(→요청 step1로 일원화). 진행중 주문 카드 / 현금 수령 요약(cash_paid_amount 합·completed_at 기준) / 최근 수거 이력 + 하단 fixed "수거 요청하기".
> - **U4 시세 상세(`/price`)** [F7·F8]: recharts 폐기 → 홈 히어로와 동일 PriceChart+resampleDaily(종가+캐리포워드)+기간 토글 체계. 이력 테이블 유지.
> - **U5 요청(`/request`)** [F9]: 3스텝 유지 + sticky 예상 **현금** 수령액 푸터 / 최근 주소 칩 / 통 크기 프리셋 / 희망시간 퀵칩 / 제출 성공 ConfirmSheet. "예상 포인트"→"예상 현금 수령액" 전수 전환.
> - **U7 주문상세(`/orders/:id`)** [F9]: CONFIRM 버튼 카피 **"무게 OO.Okg 확인 · 현금 ₩N 받았어요"**(2자 확인=현금 수령 증빙, 해요체 — 05 2026-07-10 폴리시). COMPLETED 히어로 포인트→현금 수령액. OrderTimeline PICKED_UP 스텝 미표시(레거시 조건부).
> - **지갑/출금(`/wallet`, `/wallet/withdraw`)** [F8/F13]: PointBalanceCard·출금 UI 제거 → **"수령 이력"**(주문별 현금 수령 리스트)으로 대체 예정. 탭바 "포인트"→"수령액" 개명.

> **08 피벗 개정 (상세는 08-payout-pivot.md G5 — 07 블록과 충돌 시 08 우선)**
> - **U11 지갑(`/wallet`)** [G5-①]: **포인트 지갑 부활** — 잔액 히어로(v_point_balance available/held) +
>   [출금 신청] + 포인트 내역(LedgerList point 변형: EARN/WITHDRAW_*/ADJUST) + 수령 이력(주문별,
>   PayoutMethodChip 현금/포인트 구분). 탭바 "수령액"→**"지갑"** 개명.
> - **U12 출금(`/wallet/withdraw`)** [G5-②]: 부활 — 계좌 등록/표시(useBankAccount) + 금액 입력(최소
>   10,000P·잔액 검증) → withdraw-request → 성공 시트. 반려 시 WITHDRAW_CANCEL 복구가 내역에 표시.
> - **U7 주문상세(`/orders/:id`)** [G5-③]: 계량 제출 후 지급수단 표시(PayoutMethodChip). CONFIRM 카피
>   분기 — CASH "무게 OO.Okg 확인 · 현금 ₩N 받았어요" / POINT "무게 OO.Okg 확인 · 포인트 N P 적립받기".
>   COMPLETED 히어로 수단별(현금 수령/포인트 적립+지갑 링크).
> - **U3 홈(`/`)** [G5-④]: 이번 달 수령 요약을 현금/포인트 분리 + 포인트 잔액 칩(탭→지갑). PriceChart v2
>   + PriceStatsRow 적용. **U4(`/price`)**도 동일 체계 [G5-⑤].
> - **U5 요청(`/request`)** [G5-⑥]: 18L 말통/10L/직접 kg 프리셋 유지·카피 강화("현장 계량 기준 확정",
>   예상 수령액 = 예상 kg × 시세). "예상 현금 수령액" → **"예상 수령액"**(지급수단은 현장에서 결정되므로
>   수단 중립 카피).

Realtime: `pickup_orders` 자기 행 UPDATE 구독으로 상태 자동 갱신 (폴링 금지).

### apps/rider (하단 탭: 콜/운행/정산/마이)
| 경로 | 화면 | 구현 요점 |
|---|---|---|
| `/auth`, `/verify` | R1 | 가입 → 서류 3종 업로드(rider-docs 버킷) → PENDING 대기 화면(Realtime로 승인 감지) |
| `/` | R2 콜 홈 | 온라인 토글(rider_profiles.is_online) + 오늘 실적 + REQUESTED 주문 목록(RLS open_calls, 거리순 정렬 — 거리는 클라이언트 계산) |
| `/calls/:id` | R3 콜 상세 | MapView + 수거비 대형 표시 + [수락] (order-accept, 409 시 "다른 라이더가 수락했어요" 토스트 후 목록 복귀) |
| `/active` | R4/R5/R6 운행 단일 화면 | status 분기. ACCEPTED: 지도+내비 딥링크(kakaomap://route)+[도착]. ARRIVED: 계량 입력(kg, 소수1)+PhotoUploader(필수)+[계량 제출]→"사장님 확인 대기" 배너(Realtime로 PICKED_UP 감지). PICKED_UP: 집하장 안내+QR 스캐너(@capacitor-community/barcode-scanner)→DELIVER 호출. 운행 중 15초 간격 rider-location 호출(Geolocation watch) |
| `/earnings` | R7/R8 | PointBalanceCard(held 강조: "배송완료 시 확정") + 일/주 합계 + 출금 |
| `/badge` | R9 인증 카드 | 풀스크린: 사진/이름/차량번호 + QR(JWT는 Phase 2, 지금은 rider_id QR) |
| `/history`, `/my`, `/notifications` | R10–R12 | |

> **07 피벗 개정 (상세는 07-pivot-plan.md 참조)**
> - **R2 콜 홈 / R3 콜 상세** [F5]: 상단 쿠폰 잔액 카드(v_coupon_balance + Realtime)+[충전하기]. CallCard/상세 "수거비"→"쿠폰 N장 소진"(coupon_cost)+"예상 매입 지급액"(requested_kg×시세). 잔액 부족 수락 시 INSUFFICIENT_COUPON→[충전하러 가기] CTA. 쿠폰 내역 화면(LedgerList 재사용).
> - **쿠폰 충전 화면(신설)** [F4]: 토스 결제위젯(클라이언트 키) + 수량 프리셋(10/30/50장)+직접 입력 + 성공/실패/중단 리다이렉트 + PENDING orphan 재시도.
> - **R4 운행(`/active`)** [F6]: ArrivedPanel "예상 지급 포인트"→**"점주에게 지급할 현금 ₩N"**, 제출 카피 "계량 제출 → 사장님 확인 요청". QR 스캔 단계는 레거시(PICKED_UP) 조건부 렌더로 강등 — 신규 주문은 CONFIRM으로 즉시 완료. **DISPUTED 안내 패널 신설**(useActiveRun RUN_STATUSES에 DISPUTED 포함).
> - **R7 정산(`/earnings`)** [F6]: **"수거 실적"으로 재정의**(이번 달 수거 kg/건수/현금 지급 총액, completed_at 기준 + 쿠폰 소진/충전 요약). 출금 신청 UI 라우트 제거.

> **08 피벗 개정 (상세는 08-payout-pivot.md G6 — 07 블록과 충돌 시 08 우선)**
> - **R2 콜 홈 / R3 콜 상세** [G6-①②]: 쿠폰 잔액 카드·[충전하기]·쿠폰 내역 화면·충전 화면 **전면 제거**
>   (`/coupons`, `/coupons/purchase` 라우트 삭제). CallCard/상세 "쿠폰 N장 소진" 칩 제거 — "예상 매입
>   지급액"(requested_kg×시세)은 유지. 수락 게이트는 verified·online·단일 활성 주문만.
> - **R4 운행(`/active`)** [G6-③]: ArrivedPanel에 **지급수단 세그먼트(현금 지급/포인트 지급)** 신설 —
>   제출 전 필수 선택, SUBMIT_MEASURE payload에 payoutMethod. 제출 후 안내 분기: CASH "사장님께 현금
>   ₩N을 지급하고 앱 확인을 요청하세요" / POINT "사장님이 확인하면 포인트 N P가 적립돼요". COMPLETED
>   패널 수단별 요약. 재제출 시 수단 변경 가능(중재 확정 전).
> - **R7 실적(`/earnings`)** [G6-④]: 쿠폰 요약 제거 → 이번 달 **현금 지급/포인트 지급 분리** 통계
>   (건수/kg/금액). 콜 홈 오늘 실적도 수단 분리.

### apps/admin (사이드바 내비, shadcn/ui + TanStack Table)
| 경로 | 뷰 | 구현 요점 |
|---|---|---|
| `/` | 대시보드 | 카카오맵 전체 지도(진행중 주문 핀 + 온라인 라이더 핀, Realtime) + 오늘 KPI 카드 4개(주문수/수거kg/발행P/활성 라이더) |
| `/price` | 시세 관리 | 현재값 + price-set 폼 + tick 이력 테이블 + 미니 차트 |
| `/orders` | 주문 관리 | 테이블(상태 필터) → 상세 드로어(이벤트 타임라인, 사진). DISPUTED 건: RESOLVE_DISPUTE 폼(finalKg 입력). CANCEL 버튼 |
| `/users` | 회원 관리 | supplier/rider 탭. rider PENDING 큐: 서류 이미지 뷰어 + 승인/반려(rider-verify) |
| `/settlement` | 정산 | withdrawals 큐(승인/반려/이체완료 처리) + point_ledger 감사 테이블 + 일별 합계 |
| `/depots` | 집하장 | CRUD + QR 인쇄 뷰(qr_secret을 QR 이미지로) |
| `/notify` | 공지 | 전체/역할별 푸시 발송 폼 |
- admin 로그인: 이메일/비밀번호 (admin 계정은 시드로 생성). role≠admin이면 접근 차단.

> **07 피벗 개정 (상세는 07-pivot-plan.md 참조)**
> - **`/price`** [F10]: 쿠폰 단가 섹션(현재 단가+coupon-price-set 폼+이력) 추가, rider_fee 입력 필드 제거.
> - **`/settlement` → "매출·정산" 재편** [F10]: 쿠폰 매출 대시(v_coupon_sales_daily) + 수거 활동 추이(v_pickup_stats_daily) + 쿠폰 원장 감사 + 결제 목록(coupon_purchases, EXPIRED 대사) + 환불 처리(coupon-refund). 출금 큐 제거.
> - **`/users` 라이더탭** [F10/F11]: 쿠폰 잔액 컬럼 + [수동 조정](coupon-adjust, 사유 필수) + [정지]/[해제](SUSPENDED) + 인계처(recycler) 필드.
> - **`/orders` 드로어** [F10]: coupon_cost·환급 여부·cash_paid_amount 표시, admin 취소 시 **귀책(fault) 선택 UI**(SUPPLIER/RIDER/SYSTEM), **FORCE_COMPLETE 버튼**(계량된 ARRIVED 한정, 사유 입력). ARRIVED 24h 초과 하이라이트.
> - **`/cs` (신설)** [F12]: 문의 티켓 상태 큐 + 답변 폼 + 주문 링크(CASH_DISPUTE/COUPON_PAYMENT).
> - **대시보드(`/`)** [F10]: KPI 교체(오늘 주문/수거 kg/**쿠폰 판매액**/**소진 쿠폰**/활성 라이더/**현금 거래액**, completed_at 기준).

> **08 피벗 개정 (상세는 08-payout-pivot.md G7 — 07 블록과 충돌 시 08 우선)**
> - **`/settlement` → "정산" 재편** [G7-①]: **출금 큐 부활**(withdrawals REQUESTED/APPROVED 처리 —
>   withdraw-process 승인/지급/반려) + 포인트 원장 감사 + **라이더별 포인트 지급 집계**(v_rider_payout_daily
>   — 라이더-플랫폼 오프라인 정산 근거, 08 P5) + 수거 추이(v_pickup_stats_daily cash/point 분리).
>   쿠폰 매출 대시·구매 목록·환불 UI 제거.
> - **대시보드(`/`)** [G7-②]: KPI 교체 — 오늘 주문/수거 kg/**현금 지급액**/**포인트 지급액**/**출금 대기**/
>   활성 라이더(completed_at 기준, v_pickup_stats_daily 신규 컬럼).
> - **`/orders` 드로어** [G7-③]: 지급수단 칩(PayoutMethodChip)+지급액 표시. 귀책 취소 UI 유지(환급
>   예고 카피는 레거시 쿠폰 주문에서만 표시). FORCE_COMPLETE 유지(POINT면 EARN 발행 주석).
> - **`/price`** [G7-④]: 쿠폰 단가 섹션 제거. 시세 tick 폼+이력+미니 차트(PriceChart v2)만.
> - **`/users` 라이더탭** [G7-⑤]: RiderCouponPanel(잔액/수동 조정) 제거 → 라이더별 지급 실적 요약
>   (v_rider_payout_daily). supplier 탭에 [포인트 조정](point-adjust, memo 필수) 연결.

## Capacitor 설정
- 플러그인: @capacitor/push-notifications, geolocation, camera, app, splash-screen,
  @capacitor-community/barcode-scanner (rider만)
- 딥링크: `oilpick-user://orders/:id`, `oilpick-rider://calls/:id` — 푸시 link 필드와 매핑
- iOS Info.plist: 위치(사용 중), 카메라 사용 사유 문구. rider는 위치 "항상 허용" 요구하지 않음(운행 화면 활성 시만)
- 환경변수: `.env.development` / `.env.production` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_KAKAO_KEY)

## 공통 규칙
- 데이터 fetching: TanStack Query. queryKey 컨벤션 `['orders', id]`, `['balance', userId]` 등.
  Realtime 이벤트 수신 시 해당 queryKey invalidate.
- 에러 표시: errorCodes → 한글 메시지 맵 (packages/core). 네트워크 오류 공통 토스트 + 재시도.
- 로딩: 스켈레톤 (스피너 금지, 시세/잔액 카드는 스켈레톤 형태 유지).
- 날짜: date-fns + ko locale.
