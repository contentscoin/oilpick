# 05. 디자인 고도화 스펙 (Lazyweb 레퍼런스 기반)

목적: 기존 브랜드(딥그린 #1B7A43 / 앰버골드 #F5A623 / Pretendard)와 정보구조(03-frontend.md)는
유지하면서 **실행 완성도(질감·깊이·위계)**만 끌어올린다. 리브랜딩 아님. 03-frontend.md 디자인
토큰을 대체하지 않고 확장한다.

근거: Lazyweb 디자인 리서치(2026-07-04). 매칭 강도 높은 실제 앱 패턴 —
주문추적(Uber/DoorDash/Amazon/Ro 0.64~0.68), 지갑(Bilt 0.71/Robinhood/Chevron 0.61),
라이더콜(Dasher/Uber), 온디맨드홈(Target/Instacart).

## 원칙 (기존 원칙 유지 + 보강)
- 홈=시세+버튼 하나, 숫자가 주인공, 50대 사장님 가독성(16px+/48px 터치)은 그대로.
- 추가: **깊이(elevation)** — 평평한 회색 배경 위 카드가 떠 보이게. **히어로 모먼트** — 돈/포인트/
  시세는 컬러 카드로 강조. **상태를 말로** — 추적 화면은 배지가 아니라 큰 문장으로 안내.

## 토큰 확장 (packages/ui/src/tokens.ts)
- elevation(그림자) 스케일 추가:
  - `shadow-card`: `0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)` (기본 카드)
  - `shadow-raised`: `0 4px 16px rgba(16,24,40,.08)` (히어로/떠있는 카드)
  - `shadow-pressed`: inset 느낌(선택)
- gradient 토큰:
  - `gradient-brand`: 딥그린 계열 히어로 배경 `linear-gradient(135deg,#1B7A43,#145C32)`
  - `gradient-point`: 앰버 계열 포인트 히어로 `linear-gradient(135deg,#F5A623,#E08A00)`
- surface 색: 앱 배경 `#F5F6F5`(약간 웜뉴트럴), 카드 `#FFFFFF`. 경계는 `zinc-100`.
- radius: 카드 16px 유지, 히어로 20px, pill 999px. spacing 4px 그리드 유지, 화면 패딩 20px.

## 신규 토큰 (07 F7 — 다크 시세 히어로 축)

07-pivot-plan.md F7에서 유저앱이 "일별 시세 차트가 주인공"으로 피벗하며, 딥그린 브랜드의 **명도 축을
양방향으로 확장**한다. 새 색은 없다 — 기존 딥그린(#1B7A43/#145C32)을 더 어둡게(히어로 배경) / 더 밝게
(차트 라인) 뻗은 것이다. **리브랜딩 아님**(위 원칙 유지). packages/ui/src/tokens.ts에 다음을 추가한다:

- `surfaceDark`: 다크 시세 히어로 표면. `hero #133A26`, `heroDeep #0B2317`, `textOnDark #FFFFFF`,
  `textOnDarkMuted rgba(255,255,255,0.64)`. muted는 **라벨 전용** — 수치는 순백(50대 타깃 대비 4.5:1).
  **[07 F8 추가]** `pill rgba(255,255,255,0.10)`(다크 위 pill/칩 배경 — 등락 pill),
  `skeleton rgba(255,255,255,0.06)`(다크 위 스켈레톤/플레이스홀더 배경).
- `gradient.heroDeep`: `linear-gradient(170deg,#133A26 0%,#0B2317 100%)` — 다크 히어로 배경.
- `colors.chart`: `lineOnDark #4ADE9B`(다크 위 민트 라인), `areaTop rgba(74,222,155,0.20)`(영역 상단).
  일반(라이트) 컨텍스트에서 PriceChart는 등락 방향(colors.up/down)이 stroke를 지배하고, 다크 히어로는
  stroke/areaColor prop으로 이 민트를 주입한다.
- `typeScale`: `display 40, headline 28, title 20, body 16, label 13, caption 12`(px). base 16px+ 원칙 유지.
- `motion`: `fast 150ms, base 250ms, slow 400ms, ease cubic-bezier(0.2,0.8,0.2,1)`. 모든 모션은
  `prefers-reduced-motion` 존중(차트 드로인 600ms·세그먼트 슬라이드 200ms는 컴포넌트 로컬 상수).
- `elevation.heroDark`: `0 8px 24px rgba(11,35,23,0.35)` — 다크 히어로 카드 그림자.

신규 컴포넌트: `PriceChart`(순수 SVG 라인+영역 차트, 포인터 스크럽, 드로인), `SegmentToggle`(범용
세그먼트 컨트롤, 기간 7/30/90일 용). DevUiPage(/dev-ui)에 다크 히어로 목업으로 렌더한다.

## 컴포넌트별 고도화

### PriceCard (시세 히어로) — U3 홈 상단
- 흰 카드 → 유지하되 `shadow-card`, 상단 라벨 "오늘 매입가"(zinc-500), 가격 32~40px bold
  green, /kg 접미사 작게. 등락은 pill(▲ 빨강/ ▼ 파랑/ - 회색) + "전일 대비".
- 우측에 스파크라인(recharts, 최근 7틱) 은은하게. 탭하면 /price.

### PointBalanceCard (포인트 히어로) — U11 지갑, R7 정산
- **컬러 히어로 카드**로 격상: supplier 지갑은 `gradient-point`(앰버), rider 정산도 앰버.
  잔액 숫자 흰색 36px bold tabular-nums. "보유 포인트" 라벨 흰색 80%.
- held(보류)는 카드 하단 반투명 pill "지급 확정 대기 n P"(rider는 "배송완료 시 확정").
- 카드 안 또는 바로 아래 [출금 신청] — 앰버 히어로 위에서는 흰 버튼(green 텍스트).
  (Bilt/Robinhood 패턴: 잔액을 브랜드 카드로, 액션을 그 위/아래 명확히.)

### OrderTimeline (진행 타임라인) — U7 주문 상세
- 세로 스텝퍼 고도화(Amazon/Ro/DoorDash): 완료 노드는 green 채움+체크, 현재 노드는 green
  링+살짝 강조(정적 강조, 과한 애니메이션 금지), 이후 노드는 zinc-300 빈 원. 노드 사이 연결선
  (완료 구간 green, 미완 구간 zinc-200). 각 스텝 라벨 옆 시각(있으면).

### 주문 상세 상태 헤드라인 — U7 (신규 패턴)
- 화면 상단에 배지 대신 **큰 상태 문장** + 보조설명(DoorDash "Heading to you" 패턴):
  예) REQUESTED "주변 라이더를 찾고 있어요" / ACCEPTED "라이더가 배정됐어요" /
  ARRIVED "라이더가 도착했어요" / PICKED_UP "수거가 완료됐어요" / COMPLETED "배송까지 완료됐어요".
  상태별 색(status 토큰). 이 문장은 한국어 카피, 00-domain.md 상태 라벨과 일관되되 더 대화체.

### 라이더/기사 카드 — U7 (배정 후)
- 아바타 원(placeholder 이니셜) + 이름/ "라이더" + 인증 배지(green pill "인증완료") + 차량번호.
  우측에 전화 아이콘 버튼(tel:). 카드 `shadow-card`. (Uber/DoorDash driver-card 패턴.)

### CallCard (콜 카드) — R2/R3
- 리치 카드: 좌측 거리(큰 숫자+km) / 중앙 수량(kg)·주소(truncate) / 우측 수거비 앰버 강조.
  카드 전체 탭 → 상세. `shadow-card`, 좌측에 얇은 green 액센트 바(선택).

### 라이더 콜홈 스탯 — R2
- 상단 온라인 토글: on일 때 green pill + 채워진 점, off일 때 zinc. 오늘 실적을 **2개 스탯 카드**
  (완료 건수 / 확정 포인트)로 나란히. (Dasher/courier 대시보드 패턴.)

### EmptyState — 전 앱
- 아이콘(단색 라인, 기존 커스텀 아이콘 톤) + 제목 + 한 줄 설명. 세로 중앙, 상하 여백 넉넉히
  하되 화면을 통째로 비우지 말 것(현재 라이더 콜홈의 거대한 공백 개선). 최대폭 제한.

### TabBar — user/rider
- 아이콘+라벨, 활성 green/비활성 zinc-400, 안전영역(safe-area-inset-bottom) 패딩. 라벨 잘림 방지
  (현재 "마이"가 잘리는 문제 — min height + 균등 분배 flex).

### 버튼/입력
- BigButton: green 유지, `shadow-card`, active 시 살짝 눌림(scale .99). 보조 버튼: 아웃라인.
- QtyStepper: +/- 원형 버튼 green, 중앙 수량 크게, 환산 kg 보조. 유지+정돈.

## 범위 / 비범위
- 범위: packages/ui 토큰·컴포넌트 + U3 홈, U7 주문상세, U11 지갑, R2 콜홈, R3 콜상세, R7 정산의
  시각 고도화. admin은 이번 범위 밖(기능 위주 유지).
- 비범위: 정보구조·라우팅·카피 로직 변경, 브랜드 색 교체, 다크모드, 신규 화면.
- 절대 규칙(CLAUDE.md) 불변: 포인트 클라이언트 쓰기 금지, 상태전이 Edge Function만, 텍스트 한국어,
  packages/core 공유. 기존 컴포넌트 public API/props는 최대한 유지(테스트 깨짐 최소화), 불가피하게
  바꾸면 해당 테스트도 함께 갱신.
- 접근성: 명도대비 4.5:1 이상(앰버 히어로 위 텍스트는 흰색/충분한 대비 확인), 폰트 16px+ 유지.

## 완료 기준
- pnpm lint/test/build 전부 green(컴포넌트 markup 변경 시 관련 테스트 동기 갱신).
- 브라우저 프리뷰(5173 user / 5174 rider)로 U3/U7/U11/R2/R7 스크린샷 확인 — 평평함이 사라지고
  히어로/타임라인/카드 깊이가 반영됐는지 육안 검증. 콘솔 에러 0.

## U7 주문상세 — 목업 확정 (2026-07-05 사용자 제공 목업 기준)

사용자가 제공한 두 목업(ACCEPTED/"라이더 배정" 상태)을 U7의 픽셀 타겟으로 확정한다.
요소 순서(위→아래): 헤더 → 상태 헤드라인 → 지도 → 라이더 카드 → 정보 스탯 카드 → 타임라인 → 하단 CTA.

1. 헤더: `<` 뒤로 + "수거 상세"(중앙) + 우측 알림 벨 아이콘(안읽음 시 빨간 점, /notifications 링크).
2. 상태 헤드라인: 제목은 **near-black(gray-900) 24px 800**(가독성) + 우측에 상태 pill("진행 중"=green,
   "완료"=green, "취소됨"=danger, "확인 중"=wait, "요청됨"=active). 보조문구는 라이더 이름 포함 가능
   (예 "김민준 라이더가 매장으로 이동 중이에요") — StatusHeadline에 optional subtitle/pill props 추가.
3. 지도: 카카오키 없으면 MapView placeholder 유지(가짜 ETA/경로 만들지 말 것). ETA "○분 후 도착"은
   실제 rider-location 데이터가 있을 때만 표시(없으면 생략 — 데이터 조작 금지).
4. 라이더 카드: 기존 DriverCard 사용(아바타 이니셜/이름/인증완료 pill/차량번호/green 전화버튼).
5. 정보 스탯 카드(신규, 핵심 누락분): 3열 — 예상 수량(order.requestedKg) / 오늘 매입가
   (order.snapshotPricePerKg 원/kg) / 예상 포인트(round(requestedKg*snapshotPricePerKg), 앰버 강조).
   하단에 info 아이콘 + "현장 계량 기준으로 확정됩니다". packages/ui에 InfoStatCard로 추가(3열+footnote).
   ACCEPTED/ARRIVED/PICKED_UP 등 확정 전 상태에서 노출.
6. 타임라인: OrderTimeline에 optional timestamps(각 스텝 우측 정렬, 완료/현재는 실제 시각
   order.createdAt/acceptedAt/pickedUpAt/deliveredAt, 현재 스텝 시각은 green). 데이터 없으면 "-".
7. 하단 CTA: **ACCEPTED/ARRIVED에서는 단일 "라이더에게 전화"(green, tel:)** — 목업 이미지2 기준.
   ⚠️ 목업 이미지1의 "요청 취소"는 ACCEPTED에 넣지 않는다(00-domain.md: 수락 후 공급자 취소 불가,
   admin만 가능). "요청 취소"는 REQUESTED 상태에서만(현행 유지).

비고: 목업 이미지2의 "라이더 카드가 지도 하단에 겹쳐 뜨는" 플로팅은 선택 — 안정성 위해 지도 아래
독립 카드로 둬도 무방(이미지1 스타일). 브랜드색/정보구조/절대규칙 불변.

## Admin 디자인 고도화 (2026-07-06, 이번에 범위 포함)

이전까지 admin은 "기능 위주 유지"로 범위 밖이었으나, 커스터머 앱(user/rider) 고도화가 끝나
admin만 담백한 zinc 일변도로 남았다. 커스터머 앱과 **같은 디자인 언어**를 admin에 일관 적용한다.

원칙: admin은 계속 Tailwind(shadcn 톤) 사용 — packages/ui 컴포넌트를 강제로 끌어오지 않는다
(MapView 예외 유지). packages/config Tailwind 프리셋에 이미 노출된 토큰 유틸을 쓴다:
shadow-card/shadow-raised, text-accent/bg-accent(앰버=돈), bg-gradient-point, rounded-card/hero/pill,
gray·surface·status 색, Pretendard. 로직/testid/데이터흐름/절대규칙 불변.

- 대시보드: KPI 카드 4개를 흰 카드(bg-white shadow-card rounded-card) + 큰 tabular-nums 값,
  "발행 포인트"는 text-accent(앰버) 강조. 실시간 지도(MapView)는 rounded-card+shadow-card 컨테이너.
- 테이블(주문/회원/정산/시세 이력): 카드 컨테이너(bg-white shadow-card rounded-card overflow-hidden),
  헤더 행 배경/구분선 정돈(text-gray-500), 행 hover:bg-gray-50, 숫자 컬럼 tabular-nums, 금액·포인트
  컬럼 text-accent 앰버, 상태 컬럼은 rounded-pill status 색 매핑(ORDER_STATUS_LABEL 유지).
- 정산: 출금 큐 카드에 금액 앰버 강조, 승인/반려/이체 버튼 톤(primary/outline/danger) 정돈.
- 회원: rider PENDING 큐(RiderVerifyCard) shadow-card + 서류 이미지 뷰어 rounded 정돈, 승인/반려 버튼.
- OrderDetailDrawer: 섹션 카드 elevation, 이벤트 타임라인 색 일관, 분쟁 RESOLVE 폼·사진 뷰어 정돈.
- 시세 관리: 현재값 카드 강조(원/kg green, 수거비), price-set 폼 정돈.
- 로그인: 브랜드 톤(로고+카드+primary 버튼) 정돈.
- 사이드바: 활성 primary-light 유지 + 상단 로고 정돈.

완료 기준: pnpm lint/test/build green(markup 변경 시 admin 테스트 동기 갱신). admin 로그인
(admin@oilpick.local / oilpick-admin-seed) 후 대시보드/주문/정산 스크린샷으로 깊이+앰버 강조 반영,
콘솔 에러 0. 브랜드색/정보구조/절대규칙 불변.

## 2026-07-10 폴리시 패스 (프로덕션 배포 후 UI/UX 감사 기반)

전 앱 코드 감사(로딩/에러/빈 상태·모션·터치 타깃·safe-area·폼·일관성·카피·위계 10개 관점)로
잡은 갭을 일괄 반영한다. 근거 패턴은 상단 Lazyweb 리서치(2026-07-04)와 동일 축 — 지갑 히어로
(Bilt/Robinhood), 주문추적(DoorDash) 문법의 실행 완성도를 마저 끌어올리는 것이며 리브랜딩 아님.

### 토큰 추가 (packages/ui/src/tokens.ts)
- `colors.accent.deep = #B45309` — **밝은 배경 위 "돈" 텍스트 전용 딥앰버**. #F5A623은 흰 배경
  대비 ~1.9:1로 텍스트로는 미달(50대 타깃 4.5:1 원칙). 앰버 명도 축의 어두운 확장(surfaceDark와
  같은 방식, 리브랜딩 아님). 규칙: **배경이 앰버(gradient.point)면 흰 텍스트, 배경이 밝으면
  accent.deep 텍스트.** accent.DEFAULT는 배경/그라디언트/아이콘 채움 용도로 유지.
  Tailwind(admin)에는 `text-accent-deep`로 자동 노출(프리셋이 colors.accent를 스프레드).

### 전역 규칙
- **한국어 줄바꿈**: `body { word-break: keep-all; overflow-wrap: break-word }` — 어절 중간
  꺾임("수/거 요청") 방지. packages/ui styles.css + admin index.css 동일 적용.
- **viewport-fit=cover**: user/rider index.html 뷰포트 메타에 추가. 이것 없이는
  `env(safe-area-inset-*)`가 항상 0이라 기존 TabBar/CTA의 safe-area 코드가 실기기에서 무효였다.
  상단 고정 요소(OfflineBanner, rider CallAlertListener)에도 `safe-area-inset-top` 반영.
- **키보드 포커스 링(admin)**: `:focus-visible`에 브랜드 그린 3px **outline** 링 전역 제공(입력들이
  outline-none으로 UA 링을 지워 키보드 위치가 안 보이던 문제). box-shadow가 아닌 outline인 이유:
  shadow-* 유틸리티에 덮이지 않고, forced-colors(고대비)에서도 유지되며, 요소 모양(radius)을
  바꾸지 않는다.
- **쿼리 에러 표면화**: 어떤 화면도 `isError`를 소비하지 않아 **쿼리 실패가 "0건" 빈 상태로
  위장**되던 것을 전 앱 공통으로 교정 — 빈 상태 분기보다 먼저 에러 분기("불러오지 못했어요"
  + 다시 시도/refetch). customer 앱은 EmptyState action 슬롯 재사용, admin은 QueryError 컴포넌트.
  단, 에러 분기 조건은 **`isError && data === undefined`(초기 로드 실패)로 좁힌다** — TanStack
  Query v5는 error 상태에서도 data를 보존하므로, 폴링/포커스 refetch의 일시 실패가 잘 보이던
  화면을 에러로 교체하지 않게 한다(admin 대시보드 KPI 포함 — 실패를 "0건/0원"으로 위장 금지).
- **로딩 플래시 제거**: 로딩 중 "없어요" 빈 문구가 먼저 떴다가 데이터로 교체되던 화면(user 홈
  최근 이력·시세 이력·마이, rider 콜홈 히어로/실적)에 스켈레톤 가드.

### 컴포넌트/화면
- **PriceChart**: SVG 속성 `height="auto"`는 스펙상 무효(콘솔 에러) → CSS `height:auto`로 이동.
- **BottomSheet**: 백드롭 페이드 + 시트 슬라이드업(motion.base 250ms, reduced-motion 시 즉시).
  닫힘은 기존대로 즉시 unmount(호출부 계약 불변). 하단 safe-area 패딩.
- **Toast**: 등장 모션(8px 떠오르며 페이드인, reduced-motion 존중).
- **PhotoUploader**: 삭제 버튼 히트 영역 24→40px(시각 24px 원 유지), "+" 트리거 aria-label.
- **돈 히어로 격상**(Bilt/Robinhood 패턴): user 주문상세 "받은 현금" → gradient.brand 히어로,
  rider 정산 "이번 달 지급한 현금"·콜상세 "예상 매입 지급액" → gradient.point 히어로. 셋 다
  흰 40px/32px 숫자 + elevation.raised. 평면 pale 카드였던 "돈 모먼트"의 위계 회복.
- **admin OrderStatusPill 공유화**: Orders/Dashboard의 인라인 상태 pill 매핑 중복을 단일
  컴포넌트로. 대시보드가 상태 무관 항상 green이던 버그 교정. "오늘 현금 거래액" KPI와
  Settlement 일별 현금도 앰버 강조(돈=앰버 통일). admin의 밝은 배경 위 text-accent는 일괄
  `text-accent-deep`(대비 교정).
- **admin 404**: catch-all 라우트 + NotFoundPage(이전엔 미지정 URL이 빈 화면).
- **admin 대비·시프트**: 의미 텍스트 gray-400→gray-500, Settlement 로딩 시 thead 유지,
  200건 상한 캡션 고지, 모달/드로어 Escape 닫기(한글 IME 조합 중 Escape는 무시 — isComposing
  가드) + role="dialog" aria-modal + 열림 시 초기 포커스 이동(useInitialFocus).
- **폼**: 사업자번호 inputMode="numeric", 연락처 tel(모바일 키보드).
- **카피**: 해요체 통일(주문상세 확인 CTA "받았습니다"→"받았어요").

완료 기준: pnpm lint/test/build 전부 green + dev 서버 스크린샷(홈/dev-ui/온보딩, 콘솔 에러 0).

### 후속 패스 (2026-07-11) — 다음 패스 후보 중 3건 구현
- **서버 원문 에러 한국어 매핑**: packages/core `humanizeSupabaseError` — supabase-js 직접
  호출(GoTrue OTP/PostgREST/Storage)의 영어 원문을 사용자 카피로 매핑(OTP 만료/rate limit/
  SMS 미설정/RLS/중복/네트워크 등). 한국어 메시지는 통과, 미매핑 영어는 fallback 뒤로 감춤
  (원문 노출 금지). 적용: user·rider AuthPage, ProfileEditPage, ActiveRunPage 업로드.
  Edge Function 에러는 기존 ERROR_MESSAGE_KO가 담당(대상 아님).
- **탭 전환 페이드**: packages/ui `ContentFade`(라우터 비의존, fadeKey 리마운트로
  oilpick-fade-in-up 재생) — User/RiderShell이 location.pathname을 넘겨 탭 콘텐츠만 페이드
  (탭바 제외). reduced-motion 시 즉시 표시.
- **/dev-ui 사각지대 보강**: ErrorScreen·ConfirmSheet·OfflineBanner(forceVisible 프리뷰
  prop 신설)·BigButton secondary/danger/loading·StatusHeadline REQUESTED/ARRIVED/DISPUTED·
  PriceCard 하락 케이스 목업 추가 — 스크린샷 회귀 검증 커버리지 확보.

### 후속 패스 2 (2026-07-11) — 남은 후보 3건 전부 구현
- **admin 주문 테이블 정렬+페이지네이션**: limit(200) 고정 → 페이지 50건 서버 페이지네이션
  (`.range`, 51건 요청으로 hasNextPage 판별 — user 앱 useOrderHistory와 동일 관용구) + 컬럼
  정렬(요청일/kg, `aria-sort`+▲▼, `.order(...)` 서버 반영 + id 타이브레이커로 페이지 간
  중복/누락 방지). 필터·정렬 변경 시 page 0 리셋. CSV는 현재 페이지 기준(캡션 고지).
  "최근 200건 기준" 캡션은 "50건씩 표시"로 대체. 검색은 클라이언트 필터를 유지하되 **대상이
  현재 페이지 50건으로 좁아진다**(종전 200건) — placeholder에 "현재 페이지 내 검색"으로 고지.
  페이지/정렬 전환 시 `placeholderData: keepPreviousData`로 이전 rows를 유지(테이블 붕괴·
  버튼 disabled로 인한 키보드 포커스 유실 방지 — 리뷰 확정 발견 반영).
- **헤더 관용구 통일**: packages/ui `PageHeader` 신설(라우팅 비의존 — onBack 콜백) —
  좌측 뒤로가기 44×44 + 중앙 16px/700 타이틀 + 우측 슬롯(기본 32px 스페이서, OrderDetail은
  알림 벨). user 5면+Support, rider 3면+Support의 3가지 관용구("<+중앙"/"<+좌측"/"< 뒤로"
  텍스트)를 단일 관용구로. 기존 back data-testid 전부 보존.
- **리스트 스태거 등장**: styles.css `.oilpick-stagger`(직계 자식 40ms 간격 지연,
  8번째부터 상한, reduced-motion 시 없음) — user 홈 최근 이력·알림·수령 내역, rider
  운행 이력·알림에 적용. **주변 콜 목록은 제외**(위치정보 도착·Realtime 갱신 시 거리순
  재정렬이 잦아 keyed 재삽입마다 모션이 재생돼 깜빡임 — 리뷰 확정 발견. 규칙: 재정렬
  가능성 있는 목록에는 스태거 금지).

이로써 2026-07-10 감사에서 나온 개선 후보는 전부 소진. 이후 고도화는 새 감사/사용자
피드백 기반으로 스코프를 새로 잡는다.

### 성능 패스 (2026-07-11) — 번들 실측 기반
번들 실측(user 504K / rider 888K / admin 792K JS) 결과 최대 병목은 **Pretendard 풀 가변
폰트 2MB 단일 파일**(전 앱 공통, styles.css @font-face) — jsDelivr **동적 서브셋 CSS**
(`pretendardvariable-dynamic-subset.css`, unicode-range로 화면에 쓰인 조각 woff2만 로드)로
전환. 각 앱 index.html에 preconnect + <link rel="stylesheet">, styles.css의 @font-face 제거,
tokens.ts는 `PRETENDARD_CSS_URL` 단일 상수로 정리(풀 폰트 URL·fontFaceCss 삭제 — 사용처 0 확인).
그 외: admin recharts(376K)는 라우트 lazy 확인(문제 없음), rider 408K `web` 청크는
@capacitor-community/barcode-scanner 웹 폴백으로 **다운로드되지 않는 자산**(Capacitor가
동적 import — 레거시 DELIVER 드레인 경로가 참조해 의존성 유지). 앱 JS 청크 분리
(react/supabase/query manualChunks + 라우트 lazy)는 기존 그대로 양호.
