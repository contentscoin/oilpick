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
