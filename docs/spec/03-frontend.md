# 03. 프론트엔드 명세

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

차트: 시세 그래프는 `recharts` LineChart (일/주/월 탭은 클라이언트에서 price_ticks 리샘플링).

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
