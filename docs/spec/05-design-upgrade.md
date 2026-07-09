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
