# 06 — 고도화 계획 (E-태스크)

2026-07-06 전수 분석(user/rider/admin 3앱 + 스펙 갭) 결과로 확정한 고도화 백로그.
04-tasks.md와 같은 방식: **위에서부터 순서대로**, 각 태스크는 완료 기준(DoD)을 만족해야 종료.
분석 근거는 이 문서 하단 "분석 요약" 참조. 기존 절대 규칙(CLAUDE.md)과 00~05 스펙은 그대로 유효하다.

표기: 【U】user 앱 【R】rider 앱 【A】admin 【ui】packages/ui

---

## P0 — 여정 단절 해소 (사용자가 막히거나 잃어버리는 지점)

### E1. 【U】 홈 탭바 통합 — 네비게이션 단절 해소
- 문제: `HomePage`는 `UserShell`(하단 탭) 미적용 — 탭바가 있는 화면은 Wallet/Notifications/My뿐.
  홈에서 다른 섹션으로 가려면 본문 링크에 의존하고, 탭에서 홈으로 돌아올 수 없다.
- 작업: `UserShell`을 라우트 레이아웃으로 승격(react-router `<Route element={<UserShellLayout/>}>` +
  `<Outlet/>`)하고 홈(`/`)·이력(`/orders`)을 포함해 탭 대상 화면 전체를 래핑.
  탭 구성은 03-frontend.md의 4탭(홈/수거/포인트/마이) 유지. 개별 페이지의 중복 UserShell 래핑 제거.
- 주의: `/request`, `/orders/:id`, `/wallet/withdraw` 같은 플로우 화면은 탭 없이 풀스크린 유지(현행 유지).
- DoD: 홈에 탭바 표시. 탭 4개 상호 이동 왕복 가능. 기존 라우트 테스트 green + 탭 렌더 테스트 추가.
- [x] 결과(2026-07-09): `AppShell`(UserShell+Outlet 레이아웃)로 홈/이력/포인트/알림/마이 래핑, 개별 페이지
  중복 래핑 제거(MyPage/Notifications/Wallet). 탭 렌더 4라우트 + `/request` 풀스크린 테스트 추가(App.test.tsx).

### E2. 【U】【R】 404/에러 화면 통합 — 갇힘 제거
- 문제: `OrderDetailPage`(user)에서 주문 로드 실패 시 "주문을 찾을 수 없어요." 텍스트만 렌더
  (OrderDetailPage.tsx:42-48) — 뒤로가기/홈 버튼이 없어 딥링크 진입 시 갇힌다. rider의 콜/운행 상세도 동일 패턴 점검.
- 작업: packages/ui에 `ErrorScreen`(메시지 + [뒤로가기] + [홈으로]) 컴포넌트 추가, 양 앱의
  not-found/로드실패 분기에 적용. React Router 캐치올(`*`) 라우트에도 적용.
- DoD: 존재하지 않는 주문 URL 직접 진입 → 홈 복귀 가능. 캐치올 라우트 테스트.
- [x] 결과(2026-07-09, **user 측 완료 / rider 측 잔여**): packages/ui `ErrorScreen` 신설(+테스트),
  OrderDetailPage not-found에 [홈으로]/[수거 이력] 탈출, 캐치올(`*`) NotFoundRoute + 테스트. rider 콜/운행
  상세 not-found 점검은 07-pivot-plan.md F6(운행 플로우 개편)과 함께 처리.

### E3. 【R】 콜 도착 포그라운드 알림 — 라이더 핵심 결함
- 문제: 새 콜이 와도 화면 갱신뿐, 소리/배너 없음. `push.ts:47` "Phase 1: foreground 배너/카운트 UI 없음".
  콜홈을 보고 있지 않으면 콜을 놓친다 → 매칭률에 직접 타격.
- 작업: ① `useOpenCalls` Realtime insert 이벤트에 훅 연결 → 전역 토스트/슬라이드다운 배너
  ("새 수거 콜 도착 — ○○동 5kg") + Web Audio 짧은 알림음 + `navigator.vibrate`. 온라인 상태일 때만.
  ② 배너 탭 → `/calls/:id` 이동. ③ push.ts foreground 리스너에도 동일 배너 연결.
- DoD: 온라인 상태에서 open_calls insert 시 배너+사운드 발화(vitest로 훅 로직 검증, 사운드는 mute 옵션).
  오프라인이면 미발화.

### E4. 【U】 프로필 수정 화면 (`/my/edit`)
- 문제: 가입 후 상호/담당자명/주소를 바꿀 방법이 없음(MyPage는 조회만).
- 작업: MyPage에 [수정] 진입 → 신규 `ProfileEditPage`: display_name, store_name, 주소(AddressField 재사용,
  lat/lng 갱신), 사업자번호는 읽기전용(정책). RLS 범위 내 본인 행 update(profiles + supplier_profiles).
  phone/role은 수정 불가. zod 스키마는 packages/core에 추가(`supplierProfileUpdateSchema`).
- DoD: 수정 → 저장 → MyPage/홈 반영. RLS 통과(본인만). vitest 폼 검증 테스트.
- [x] 결과(2026-07-09): `/my/edit` ProfileEditPage 신설(display_name/store_name/주소, 사업자번호 읽기전용),
  `supplierProfileUpdateSchema`(packages/core). MyPage 매장카드에 [수정] 진입점. 폼 검증 테스트 4건.

### E5. 【U】 주문 취소 확인 다이얼로그 + 취소 후 복귀 경로
- 문제: REQUESTED 취소 버튼이 즉시 실행(실수 취소 위험). CANCELLED 화면에 [다시 요청]/[홈] 버튼 없음.
- 작업: packages/ui `ConfirmSheet`(BottomSheet 기반 — 이미 정의된 BottomSheet 재사용) 추가.
  취소 시 사유 없이 2버튼 확인. CANCELLED 패널에 [다시 요청하기](→ `/request`) + [홈으로] 추가.
- DoD: 취소 플로우 2-step 동작. CANCELLED에서 재요청 진입 가능. 테스트 추가.
- [x] 결과(2026-07-09): packages/ui `ConfirmSheet`(BottomSheet 기반, +테스트 7건) 신설. 취소 버튼 →
  확인 시트 → CANCEL 전이 2-step(테스트로 강제), CANCELLED 패널에 [다시 요청하기]/[홈으로] 추가.

---

## P1 — 신뢰·완성도 (베타 전 필요)

### E6. 【U】【R】 액션 피드백 토스트 통일
- 문제: 취소/계량확인/이의신청/저장 성공 시 무피드백(상태만 바뀜), 에러 표기가 페이지마다 제각각
  (인라인 텍스트 vs Toast).
- 작업: packages/ui `Toast`를 전역 프로바이더(`ToastProvider` + `useToast`)로 승격, 양 앱 mutation
  성공/실패에 일괄 적용. 표준 문구는 한국어(예: "요청을 취소했어요").
- DoD: 주요 mutation 8곳+ 적용, 프로바이더 단위 테스트.

### E7. 【U】 알림 미읽음 배지
- 문제: 벨 아이콘에 미읽음 표시가 없어 알림 도착을 알 수 없음.
- 작업: `useUnreadCount`(notifications where read_at is null, Realtime 구독) → 벨에 빨간 도트/숫자.
  홈·주문상세 헤더 공통. 탭바 알림 진입점이 없으므로 벨은 유지.
- DoD: 미읽음 n>0이면 배지, 알림함 진입 후 읽음 처리 시 사라짐. 훅 테스트.

### E8. 【R】 출금 상태 추적 + 운행 지원 보강
> **[07 판정]** E8-①(출금현황 카드) **[폐기 — 07 D1/상태머신 변경]**(라이더 수거비·출금 소멸, F6-⑤가 대체), E8-②(QR 재스캔) **[폐기 — 07 D1/상태머신 변경]**(DELIVER 단계 소멸). ③④는 유지.
- 작업: ① EarningsPage에 출금 신청 현황 카드(REQUESTED/APPROVED/PAID/REJECTED 상태 뱃지,
  최근 3건). ② ActiveRunPage QR 실패 시 [다시 스캔] 버튼. ③ 사진 업로드 중 진행 표시(개수 기반
  "2/3 업로드 중"로 충분 — per-byte 진행률 불필요). ④ ActiveRunPage에 [사장님께 전화] `tel:` 버튼
  (user 앱 DriverCard 패턴 역방향; supplier phone은 배정 라이더에게 이미 RLS 허용된 범위 확인 후,
  없으면 조회 정책 추가 필요 — 20260704000010 마이그레이션 패턴 참고).
- DoD: 4개 각각 렌더/동작 테스트. 전화 버튼은 RLS로 supplier phone 조회 가능 확인 포함.

### E9. 【R】 운행 히스토리 페이지 (`/history` placeholder 제거)
- 작업: 완료/취소된 배정 주문 목록(날짜·주소·kg·수거비) + 월 합계 헤더. 페이지네이션은
  user OrdersHistoryPage 패턴 재사용.
- DoD: COMPLETED 주문이 목록에 표시. EmptyState. 테스트.

### E10. 【A】 운영 확장 기능 1차 — 검색/기간필터/CSV
> **[07 판정]** E10-②(출금큐·원장 필터) **[대체 — 07 F10-③]**(대상을 쿠폰 매출·충전 이력으로). ①③④는 유지(CSV는 F10-⑥이 흡수).
- 문제: 관제·정산에 검색/기간필터/내보내기가 없어 주문 수백 건부터 운영 불가.
- 작업: ① OrdersPage: 텍스트 검색(주소/공급자/라이더명, ilike) + 날짜 범위 필터.
  ② SettlementPage: 출금 큐 사용자명 검색 + 원장 날짜범위·유형 필터.
  ③ 공통 CSV 내보내기 유틸(클라이언트 생성, BOM 포함 — 엑셀 한글 호환) → 주문/원장/출금 3곳.
  ④ PricePage: tick 등록 실수 대비 — 최신 tick "즉시 정정"(신규 tick 재등록 유도 배너)로 처리,
  과거 tick 수정은 스냅샷 원칙(절대규칙 5)상 금지 명시.
- DoD: 검색/필터 동작 + CSV 다운로드 파일 검증 테스트. RLS/뷰 변경 없음(클라이언트 필터 + 쿼리 파라미터).

### E11. 【U】 홈 히어로 격상 + 시세 스파크라인
> **[폐기 — 07 F7/F8로 승격 흡수]** 앰버 예상포인트 히어로는 구모델 전제 — 그대로 만들면 100% 재작업.
- 작업: ① 홈 예상포인트를 amber gradient 히어로 카드로(05-design-upgrade.md `gradient-point` 토큰,
  OrderDetail COMPLETED 포인트 히어로와 동형). ② PriceCard에 최근 7틱 스파크라인(단순 SVG polyline,
  recharts 불필요 — 번들 고려). ③ "#333"/"#fff" 하드코딩 → gray/surface 토큰 치환(user 앱 전체 sweep).
- DoD: 홈 히어로 렌더 스냅샷 테스트. 하드코딩 색상 grep 0건(#fff는 토큰 참조로).

### E12. 【R】【뼈대 페이지 3종 디자인 고도화】 BadgePage / MyPage / NotificationsPage
- 작업: 05-design-upgrade.md 토큰(elevation, surface, gradient) 적용. BadgePage: 인증카드를 명함형
  히어로(그린 그라디언트 배경 + 흰 카드 + QR 중앙)로. MyPage: 섹션 카드화 + 준비중 항목은 회색
  비활성 명시. NotificationsPage: 미읽음 좌측 그린 바 + 상대시간.
- DoD: 3페이지 스냅샷 테스트 갱신, 디자인 토큰 외 하드코딩 색상 금지.

---

## P2 — 베타 이후 (지금은 하지 않음, 기록만)

- 【U】 라이더 리뷰/별점(COMPLETED 후), FAQ/고객센터 실링크, PWA manifest+아이콘, 온보딩 스와이프 제스처
- 【R】 주변 콜 지도 뷰(카카오 실키 이후), 월별 수익 차트, GPS 자동 도착 감지
- 【A】 공지 발송 이력·예약 발송, 벌크 액션, 다중 정렬, 원장 페이지네이션 UI 고도화
- 공통: 다크모드, 자동이체 API(Phase 5+), 정기수거

## 스코프 제외(환경/외부 의존 — 코드로 해결 불가)
실 FCM 발송(서비스계정 필요), 카카오맵/주소검색 실키, 실 SMS(Twilio), 실기기 QR/딥링크/푸시 검증,
브랜드 로고. → docs/oilpick-launch-plan.md와 qa-checklist.md 🔴 항목 참조.

---

## 구현 규칙 (Opus 작업 시)
1. E1부터 순서대로. 각 태스크는 독립 커밋(또는 PR)로, `pnpm lint && pnpm test && pnpm build` green 필수.
2. 공용 UI는 packages/ui에(앱별 중복 금지 — CLAUDE.md 규칙 7). 신규 컴포넌트는 DevUiPage에 목업 추가.
3. 상태 전이·포인트 관련 절대 규칙(클라이언트 직접 쓰기 금지) 그대로 — 이 백로그에 DB 마이그레이션이
   필요한 항목은 E8-④(전화 조회 정책)뿐이며, 필요 시 01-db-schema.sql 동기화.
4. 완료 시 이 문서의 해당 태스크에 `[x]` 표시 + 04-tasks.md 방식의 한 줄 결과 기록.

---

## 분석 요약 (2026-07-06, 3-agent 전수 분석)

**완성도 현황**: user 앱 평균 ~80%(Auth/Request/OrderDetail/Wallet/Withdraw 95%, Home/My/Notifications 70%),
rider 앱 ~85%(운행 플로우 완성, Badge/My/Notifications 뼈대), admin 7/8페이지 기본형~고도화.

**교차검증된 P0 결함**: ① HomePage `UserShell` 미적용(사용처: My/Notifications/Wallet 3곳뿐) —
소스 확인. ② OrderDetailPage.tsx:42-48 not-found 분기에 탈출 UI 없음 — 소스 확인.
③ rider `push.ts:47` foreground 배너 미구현 주석 — 소스 확인.

**디자인 격차 축**: 최근 고도화된 화면(U7 OrderDetail, admin Orders/Price/Settlement)과 나머지
화면 간 elevation/히어로/상태색 적용 격차. 05-design-upgrade.md 토큰은 이미 정의돼 있어 적용만 남음.

**admin 운영 리스크**: 검색·기간필터·CSV 부재로 데이터 수백 건 이상에서 관제/정산 불가(E10).
