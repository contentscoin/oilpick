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

- **[15]** 모션 토큰(`motion.spring/sheet/count/pulse`)과 **UI 액센트 확장**(`colors.lime`·
  `colors.cyan`·`surfaceDark.beui`·`surfaceDark.panel`)이 추가됐다. 라임/시안은 **다크 배경
  전용**(밝은 배경 위 텍스트 금지). 값·용도·제약의 단일 진실은 15-motion-design.md.
  ※ 위 코드블록의 primary/accent 값은 작성 시점(오일픽) 표기이며, 현행 값은 tokens.ts와
  10-brand.md B6이 진실이다(딥그린 `#1C5A38` / 앤티크골드 `#C99A46`).

## packages/ui 컴포넌트 (user/rider 공용)
`PriceCard`(현재가+등락+스파크라인), `OrderTimeline`(상태 스텝퍼, 세로형),
`CallCard`(거리/수량/수거비), `PointBalanceCard`(available 크게, held는 "지급 확정 대기 nP" 보조 표기),
`BigButton`(높이 56px CTA), `QtyStepper`(통/kg 토글), `BottomSheet`, `TabBar`, `Toast`,
`EmptyState`, `PhotoUploader`(카메라 촬영 전용, Capacitor Camera), `MapView`(MapLibre GL 래퍼 — 11-map-renderer.md M8, 타일 env 게이트·프리뷰 폴백),
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

> **09 레퍼럴 개정 (상세는 09-referral.md H3/H4)**
> - **추천 랜딩(`/ref/:code`)** [H3]: **신규 화면**(AuthGuard 밖 — 미인증 접근 허용). 유효 코드면 localStorage
>   (`oilpick_referral_code`)에 저장 + 보너스 안내(REFERRAL_SUPPLIER_BONUS) + [가입하고 시작하기](미인증)/[홈으로](로그인) CTA.
>   딥링크 `oilpick-user://ref/<code>`가 deeplink.ts로 이 경로에 정규화. 스토어 링크는 env 플레이스홀더.
> - **가입(`/auth`)** [H4]: supplier_profiles insert 성공 직후 저장된 코드로 `referral-attach` 호출(best-effort, 비차단).
> - **U11 지갑(`/wallet`)** [H4]: LedgerList에 `REFERRAL`("추천 보너스") 라벨 추가 — 추천 보너스 적립이 내역에 표시.

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

> **09 레퍼럴 개정 (상세는 09-referral.md H4)**
> - **내 추천(`/referrals`)** [H4]: **신규 화면**(탭바에 없음 — 마이 "내 추천" 진입). 내 추천코드·공유 링크
>   (복사/공유, referral-code Edge) + 실적(가입/활성화/전환율/누적 보상, v_referral_stats + referrals Realtime).
>   라이더 보상은 오프라인 정산 근거로만 표기(08 P5 — 라이더 지갑 없음). **마이(`/my`)**에 진입점 추가.

### apps/admin (사이드바 내비, shadcn/ui + TanStack Table)
| 경로 | 뷰 | 구현 요점 |
|---|---|---|
| `/` | 대시보드 | 카카오맵 전체 지도(진행중 주문 핀 + 온라인 라이더 핀, Realtime) + 오늘 KPI 카드 4개(주문수/수거kg/발행P/활성 라이더) |
| `/price` | 시세 관리 | 현재값 + price-set 폼 + tick 이력 테이블 + 미니 차트 |
| `/orders` | 주문 관리 | 테이블(상태 필터) → 상세 드로어(이벤트 타임라인, 사진). DISPUTED 건: RESOLVE_DISPUTE 폼(finalKg 입력). CANCEL 버튼 |
| `/users` | 회원 관리 | supplier/rider 탭. rider PENDING 큐: 서류 이미지 뷰어 + 승인/반려(rider-verify) |
| `/settlement` | 정산 | withdrawals 큐(승인/반려/이체완료 처리) + point_ledger 감사 테이블 + 일별 합계 |
| `/depots` | 집하장 | CRUD + QR 인쇄 뷰(qr_secret을 QR 이미지로) |
| `/dealers` | 좌상 관리 [13 I3] | 좌상 계정 생성(dealer-create) + 라이더 소속 배정(dealer-assign). admin 전용 |
| `/notify` | 공지 | 전체/역할별 푸시 발송 폼 |
- admin 로그인: 아이디/비밀번호. role∈{admin, dealer}만 접근(그 외 차단). 메뉴·라우트는 role로 분기(13 I3).

> **[13] 좌상(dealer, 서브어드민) 화면** — 같은 admin 웹에 좌상 계정으로 로그인하면 서브어드민 메뉴만:
> | 경로 | 뷰 | 요점 |
> |---|---|---|
> | `/` | 관할 대시보드 | 소속 라이더 KPI + 목록(승인/정지/해제, rider-verify 자기소속). RLS가 범위 강제 |
> | `/performance` | 소속 실적 | v_dealer_rider_stats 테이블 + CSV. 지급액은 표시용 통계 — **정산 화면 없음**(D5) |
> admin 라우트(주문/시세/정산 등)는 RoleGate로 dealer 접근 시 `/`로 리다이렉트.

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

> **09 레퍼럴 개정 (상세는 09-referral.md H4)**
> - **레퍼럴(`/referrals`, 신설)** [H4]: 사이드바 "레퍼럴" 내비 추가. 요약 KPI(총 가입/활성화/전환율/지급 보너스)
>   + 라이더별 추천 퍼널 테이블(v_referral_stats — 가입→활성화→전환율+보너스/보상) + 일별 추이(v_referral_daily)
>   + CSV 2종(BOM). referrals Realtime로 갱신. 라이더 보상은 오프라인 정산 근거(08 P5).

> **09 H8 보상 정산 개정 (2026-07-16)**
> - **레퍼럴(`/referrals`)**: "보상 정산 큐" 섹션 신설 — ACTIVATED·미정산 목록(라이더/점주/보상액/활성화일)
>   + [지급 완료](referral-settle Edge) + 미지급 합계. 퍼널 테이블에 정산 완료/미지급 컬럼·CSV 확장.
> - **rider 내 추천**: 누적 보상 아래 "정산 완료 N원 · 대기 N원" 분리 표기(정산 이력 있을 때).

> **교차 이음새 감사 개정 (2026-07-16)**
> - **admin 알림 벨(AdminShell, 신설)**: 이의신청·무수락 자동 취소 등 admin 대상 notifications의 소비 지면
>   (00-domain 알림 매트릭스 "admin 웹 알림" — 기존엔 소비처가 없어 데드레터였던 확정 결함 수정). 사이드바
>   벨 + 미읽음 배지 + 패널(useAdminNotifications, notifications 본인 행 + Realtime INSERT invalidate).
>   행 클릭 시 read_at 갱신 후 `remapToAdminRoute`로 이동 — 서버 공용 표기 `/orders/:id`는 admin 드로어
>   딥링크 `/orders?order=<id>`로 재매핑(rider deeplink 재매핑과 동일 계층), 미지 경로는 no-op.
> - **rider 알림함(`/notifications`)**: 행 클릭 navigate가 raw link 대신 `normalizeDeepLink`를 경유하도록
>   수정 — `/orders/:id`→`/calls/:id`, `/wallet`→`/earnings` 재매핑이 푸시 탭과 동일하게 적용된다(기존엔
>   캐치올로 홈에 떨어지던 확정 결함).

> **16 운영편의성 개정 — 라이더 현장(L3, 2026-08-02)**
> - **R2 콜 홈(`/`)**: "주변 콜" 헤더 우측 **정렬 세그먼트**(가까운순[기본]·지급액순·최신순 — `call-sort-*`).
>   클라이언트 정렬 전용, 배차 규칙(13 D7 전체 공개) 불변. 위치 없으면 가까운순=서버 순서 유지.
> - **R3 콜 상세(`/calls/:id`)**: 주소 카드에 **"도로 기준" 거리·소요 칩**(`call-detail-road`) + 지도
>   경로선·ETA — rider `useDirections`(user와 동일 절삭·캐시 계약). 위치 거부·키 미설정 시 칩 미표기.
> - **R4 운행(`/active`)**: ① ACCEPTED 지도에 내 위치→수거지 **경로선+ETA 칩**(주 내비는 계속 외부 앱
>   딥링크 — 11 M9-b 라이더측). ② RunSwitcher(다중 콜)에 **거리 칩+권장 방문 순서 뱃지 ①②③**
>   (`run-visit-badge-*`/`run-distance-*`) — ARRIVED 상단 고정→근거리순, 좌표 없는 건 맨 뒤(12 §S1),
>   위치 없으면 뱃지 미표기. useActiveRunSummaries가 pickup_location을 추가 조회(서버 변경 0).
> - **R12 마이(`/my`)**: "알림 받기"→**"콜 알림음"**(소리 한정 캡션). localStorage 단독 저장(미배선)을
>   Zustand persist 스토어(`stores/notifyPref`)로 승격 — CallAlertListener가 구독해 `useCallAlert({mute})`
>   실배선(mute=소리만, 배너·진동 유지). 레거시 키(`oilpick:notify-enabled`)는 최초 1회 이관.
> - **R5 계량 제출 드래프트(L4, `lib/measureDraft`)**: orderId 키 자동 저장 — 텍스트 입력(kg·수단·통수·
>   바코드·GPS)+업로드 체크포인트는 localStorage, 사진 Blob은 IndexedDB(미지원 환경은 텍스트만 강등).
>   재진입 시 "작성하던 내용을 불러왔어요" 배너(저장 시각+[지우기]). 업로드는 사진 지문→서명 URL
>   체크포인트로 성공분 스킵. 제출은 기존 SUBMIT_MEASURE 1회 그대로(멱등) — **오제출 이중 가드**:
>   복원 시(중재 완료면 파기) + 제출 직전 서버 status·final_kg 재확인. 파기: 제출 성공·종결·7일 경과.
>   제출 실패 시 "입력 내용은 저장돼 있어요" 안내 + 온라인 복귀 감지 재시도 유도(자동 재제출 없음).
> - **R5 대기 배너(L5)**: [확인 요청 다시 보내기](confirm-remind, 주문당 2h 1회 서버 강제) +
>   "24시간이 지나면 본사에 자동 접수돼요" 캡션(자동 에스컬레이션 안내 — 수동 버튼 중복 제거).
> - **R7 수거 실적(L9, `my-payout-card`)**: '플랫폼 정산' 카드 — v_my_payout_daily(본인 스코프)로
>   이번 달 포인트 지급분 합계+일별 접이식. 카피 "오프라인 정산 대상 — 지급 일정은 본사 안내"
>   (지갑/출금 오해 차단, 08 P5 불변). 추천 보상 정산 완료 시 푸시(referral-settle append).

> **16 운영편의성 개정 — 좌상 화면(L6~L9, 2026-08-02)**
> - **관할 대시보드(`/`)**: ① [L6] '진행중 운행' 관제 섹션 — v_dealer_active_orders(재무 컬럼 제외
>   invoker 뷰, 14 §2-5 예약 실행) + 상태 pill + ARRIVED 24h '확인 지연' 배지 + 라이더 tel: CTA
>   (현 소속만). 조회 전용 — 상태 액션 없음(13 D3). ② [L9] 라이더 액션 4-decision 완성 —
>   PENDING→승인/반려(사유 필수 모달), APPROVED→정지(사유 모달), SUSPENDED→정지 해제.
>   파괴적 액션(반려·정지·소속 해제)은 확인 다이얼로그. 서버·훅 변경 0(권한 확대 없음).
> - **내 정산 명세(`/statement`) [L7]**: '미정산 내역' 섹션(POINT 순액 합계 = usage 카드 1:1 대사)
>   + 청구 이력 행별 [CSV](admin과 공용 `lib/settlementCsv` — 뷰 실컬럼 그대로, gross/net 구분).
> - **알림 [L8]**: settlement-watch(15분 cron)의 크레딧 80%·임계 경보 + dealer-claim 청구
>   라이프사이클 통지를 기존 NotificationsBell로 수신(신설 표면 없음).
- 플러그인: @capacitor/push-notifications, geolocation, camera, app, splash-screen,
  @capacitor-community/barcode-scanner (rider만)
- 딥링크: `oilpick-user://orders/:id`, `oilpick-user://ref/:code`(09 H3 추천 랜딩), `oilpick-rider://calls/:id` — 푸시 link 필드와 매핑
- 추천 링크(웹): Edge(referral-code)가 `REFERRAL_BASE_URL`(Supabase 시크릿, 미설정 시 core `REFERRAL_LINK_BASE`=`https://app.oilpick.kr`)로 `${base}/ref/<CODE>`를 조립해 shareUrl로 반환 — 앱은 서버가 준 shareUrl을 그대로 표시(앱 env로 별도 조립 안 함)
- iOS Info.plist: 위치(사용 중), 카메라 사용 사유 문구. rider는 위치 "항상 허용" 요구하지 않음(운행 화면 활성 시만)
- 환경변수: `.env.development` / `.env.production` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MAP_STYLE_URL — MapLibre 타일, 11 M8; user만 VITE_KAKAO_KEY — 주소검색)

## 공통 규칙
- 데이터 fetching: TanStack Query. queryKey 컨벤션 `['orders', id]`, `['balance', userId]` 등.
  Realtime 이벤트 수신 시 해당 queryKey invalidate.
- 에러 표시: errorCodes → 한글 메시지 맵 (packages/core). 네트워크 오류 공통 토스트 + 재시도.
- 로딩: 스켈레톤 (스피너 금지, 시세/잔액 카드는 스켈레톤 형태 유지).
- 날짜: date-fns + ko locale.

## 14 신유·정산 화면 (J-태스크, 14-fresh-oil-settlement.md 단일 진실)

- **user**: RequestPage 신유 구매 스텝(고시가·상계 미리보기, `?mode=purchase` 단독 진입, 폐유 0 허용) +
  OrderDetailPage 라이더 실시간 마커(useRiderLocation) + arrived_at 타임라인. 훅 useFreshOilPrice.
- **rider**: ActiveRunPage ArrivedPanel deliveredCans 스테퍼 + 현장 상계 미리보기(net 양/음) + measuredKg/바코드
  게이트 완화(구매 동반). useActiveRun에 order_kind·purchase_* 컬럼 추가.
- **admin**: PricePage 신유 판매가 섹션. DealerSettlementPage(/dealer-settlement — 좌상별 계정 폼·명세·청구/정산/무효·
  CSV). 나브 "좌상 정산" 추가.
- **dealer**: DealerStatementPage(/statement — 본인 사용액/한도/여유·청구 이력, 읽기 전용). 나브 "정산 명세" 추가.
- ui: QtyStepper `subLabel` prop(신유 통수엔 kg 환산 억제), MapView `riderMarker` prop(앰버 실시간 마커).
