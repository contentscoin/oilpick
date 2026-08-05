# 16 — 라이더·좌상 운영편의성 고도화 (L-태스크, 7차)

2026-08-02 지시: "라이더, 좌상의 운영편의성을 높일 수 있는 기능 고도화 기획."
**이 문서가 7차 고도화(운영편의성)의 스코프·설계·태스크의 단일 진실이다.**
08(현장 지급수단)·09(레퍼럴)·13(조직 계층)·14(신유 정산) 위에 **순수 추가** —
정보구조(03)·상태머신(00)·원장 규칙(절대 규칙 1·2)은 **불변**이다.

기획 절차: 스펙 전 문서 + rider/admin 앱 코드 전수 분석(gap 62건) → 3관점(라이더 현장 동선·
좌상 관리 업무·알림 자동화) 제안 21건 → 3렌즈(스펙 정합성·운영 임팩트·구현 노력/리스크) 심사.
중복 제안군(관제 3건·CSV 3건·리마인드 2건·크레딧 경보 2건)은 심사 지시대로 병합했고,
최종 **채택 10개 작업 단위 / 스코프 밖 4건(§7)**.

표기: 【R】rider 앱 【D】dealer 화면(admin 웹 내) 【A】admin 화면 【U】user 앱
【DB】마이그레이션 【EF】Edge Function 【core】packages/core 【docs】문서

## 0. 불변 조건 (전 기능 공통)

1. **상태 무접촉.** 본 문서의 어떤 기능도 `pickup_orders.status`를 바꾸지 않는다 —
   리마인드·에스컬레이션·관제 전부 조회 + 알림뿐. 교착 해소의 최종 수단은 여전히
   supplier CONFIRM_MEASURE 또는 admin FORCE_COMPLETE(00-domain, 08 P2 2자 확인 원칙 불변).
2. **원장 무접촉.** 신규 쓰기는 notifications insert(service_role EF 내부)뿐. 포인트/쿠폰
   원장·잔액 로직은 일절 건드리지 않는다.
3. **RLS·뷰는 순수 추가.** 기존 정책·뷰 정의 불변(뷰 재정의 시 컬럼 append 관례 준용).
4. **EF 신설 로직은 검증 가능해야 한다.** 판정 로직(리마인드 기산·dedupe·밴드 교차)은
   순수 헬퍼로 분리해 vitest/deno test로 고정하거나 SQL로 내려 pgTAP로 고정한다 —
   리포에 Deno EF 통합 테스트 하네스가 없다는 사실을 산정에 반영한 원칙.
5. **cron 배선은 리포 밖 배포 설정이다**(order-expire/index.ts:6-7 선례). cron 의존 기능은
   DEPLOY.md에 배선 절차 + **미배선 시 수동 호출 검증** 절차를 반드시 남긴다 — 미배선
   환경에서 기능이 조용히 죽는 실패 모드를 문서로 봉인.

## 1. 결정 기록 (L-D)

| # | 결정 | 확정 |
|---|---|---|
| L-D1 | 스코프 = 심사 상위 채택 10개 작업 단위(§2~§6). 탈락 4건은 §7에 사유와 함께 기록 — 재론 시 §7 조건 충족 선행 | 2026-08-02 |
| L-D2 | **알림 계층 선행 단일화**: `notifications.kind` 컬럼 + `_shared/push.ts` dedupe 헬퍼 1개를 기반 작업(L2)으로 먼저 넣고, 이후 모든 리마인드·워치는 이 메커니즘만 쓴다. EF마다 dedupe를 재발명하지 않는다 | 2026-08-02 |
| L-D3 | 좌상 관제는 **14 §2-5가 예약한 설계 그대로** — 재무 컬럼 제외 security_invoker 뷰 `v_dealer_active_orders` 신설. 클라이언트 select 컬럼 제한 방식(경쟁안) 기각: DB가 노출 범위를 강제해야 pgTAP로 고정 가능 | 2026-08-02 |
| L-D4 | 확인 리마인드는 **cron 자동(2h/12h supplier → 24h admin) + 라이더 수동 버튼 겸용**. 기산점은 `order_events` 최근 SUBMIT_MEASURE(신규 컬럼 없음). 24h admin 에스컬레이션이 자동이므로 라이더측 [본사에 도움 요청] 수동 버튼은 두지 않는다(중복) — 캡션 안내로 대체 | 2026-08-02 |
| L-D5 | 크레딧 경보는 **cron 분리형(`settlement-watch`)** 채택, order-transition 인라인 후크안 기각(전이 핫패스 오염·경합 시 중복 발화). **자동청구 없음(14 §4) 불변** — 알림까지만 자동화 | 2026-08-02 |
| L-D6 | 좌상 CSV는 **미정산 라인 섹션 + 청구 행별 CSV 통합안**. CSV 컬럼은 `v_dealer_settlement_orders` 실컬럼 그대로(kg 없음 — 뷰 변경 금지), gross(cash_paid_amount)/net(net_amount) 구분 표기로 14 §10-5 드리프트 재도입 방지 | 2026-08-02 |
| L-D7 | 인앱 경로·ETA는 **M9-b의 라이더측 대칭**까지만 — M9-c 풀 턴바이턴 확장 금지(11 '비권장 유지'). 주 내비는 계속 외부 앱 딥링크. `KAKAO_MOBILITY_KEY` 실 키 실측(11 🔴)이 선행조건 — 미확보 시 이 항목만 착수 후순위로 내린다 | 2026-08-02 |
| L-D8 | supplier 확인 마찰 축소는 【U】 1곳만 — 리마인드 푸시 딥링크가 OrderDetail **확인 카드로 자동 스크롤·강조**. 확인 흐름 자체(2자 확인)는 불변 | 2026-08-02 |

## 2. 공통 기반 — 알림 계층 단일화 (L2)

리마인드·조기경보·정산워치가 전부 "최근에 같은 알림을 보냈는가"를 판정해야 하는데
`notifications`에는 분류 컬럼이 없다. 기반 1건을 먼저 깐다.

- 【DB】 마이그레이션 1개: `alter table notifications add column kind text;`(기존 행 null 허용
  — 레거시 무해) + `create index idx_notifications_dedupe on notifications (user_id, kind, created_at desc);`
  01-db-schema.sql 동기화. RLS 불변(기존 본인 read 정책 그대로).
- 【core】 `NOTIFY_KIND` 상수: `CONFIRM_REMIND_AUTO` · `CONFIRM_REMIND_MANUAL` ·
  `CONFIRM_ESCALATION` · `CREDIT_BAND_80` · `CREDIT_OVER_THRESHOLD` · `CLAIM_CREATED` ·
  `CLAIM_SETTLED` · `CLAIM_VOIDED` · `PAYOUT_REFERRAL_SETTLED` (앱별 중복 정의 금지 — 규칙 7).
- 【EF】 `_shared/push.ts`에 `sendPushDeduped({ userId, kind, link, windowMs, title, body })`:
  같은 (user_id, kind, link) 알림이 windowMs 내 존재하면 발송·기록 모두 스킵.
  판정 로직 `shouldSend(recentRows, windowMs, now)`는 **순수 함수로 분리**해 deno test(§0-4).
- pgTAP: 컬럼·인덱스 존재 assert(스위트 말미 1~2건).

## 3. 라이더 현장 (L3·L4)

### 3-1. 인앱 경로 미리보기·ETA 【R】 — 심사 1위(8.0)

- **문제**: M9-b 지도(경로선·ETA)는 user 앱에만 붙어 라이더는 외부 앱으로 이탈해야 거리·소요를
  안다. 수락 판단 시점(CallDetailPage)에도 직선거리 숫자뿐.
- **동작**: ① ActiveRunPage ACCEPTED 패널 MapView에 directions Edge 호출 → 도로 경로선
  (MapView.routePath) + ETA 칩(formatEta), 방향은 내 위치→수거지. ② CallDetailPage(수락 전)에
  예상 도로거리·소요 칩. ③ 외부 앱 딥링크는 주 내비로 유지(L-D7).
- **변경점**: DB·EF 0 — directions Edge는 이미 인증 사용자 전체 허용 + `configured:false` 폴백
  계약. `useDirections` 훅은 user 앱 패턴 이식하되 **입출력 타입은 core 공유**(규칙 7).
- **심사 반영**: 좌표 소수 3자리 절삭 + staleTime 60초 캐시 계약을 user 앱과 동일하게 강제
  (콜 상세 다건 연속 열람 시 호출량 억제). GPS 권한 거부·실패 시 칩 미표기 폴백 + 테스트.
  `KAKAO_MOBILITY_KEY` 미설정이면 경로선만 조용히 생략(기존 직선거리 폴백).
- 11-map-renderer.md M9-b 절에 "라이더측 수신 UI" 행 append.

### 3-2. 계량 제출 드래프트 저장·전송 재개 【R】 — 오프라인 내성

- **문제**: 하루 중 가장 긴 수기 입력(kg·지급수단·바코드≤50·신유 통수·사진)이 가장 약한
  네트워크 지점(지하 주방 등)에서 일어나는데, 전 상태가 로컬 useState이고 순차 업로드 루프가
  throw 시 전체 중단(ActiveRunPage) — 실패하면 전부 재입력.
- **동작**: ① orderId 키 드래프트 — 텍스트 입력은 localStorage, 사진 Blob은 IndexedDB에 입력
  즉시 자동 저장, 재진입 시 "작성하던 내용을 불러왔어요" 복원 배너. ② 업로드 체크포인트 —
  사진별 성공 시 스토리지 경로를 드래프트에 기록, 재시도 시 성공분 스킵. ③ 제출 실패 시
  "저장됨 — 신호가 잡히면 다시 제출해 주세요" + 온라인 복귀 감지 시 재시도 유도.
  ④ 제출 성공·주문 종결·7일 경과 시 드래프트 파기.
- **변경점**: DB·EF 0 — 제출은 지금과 동일한 order-transition SUBMIT_MEASURE 1회(멱등 기지원).
  `lib/measureDraft.ts` 신설(Zustand persist + IndexedDB).
- **심사 반영**: effort는 **M으로 재산정**(IndexedDB Blob 수명 관리·체크포인트·fake-indexeddb
  테스트 셋업 포함). 복원 시점 **그리고 제출 직전** 서버 status·final_kg 재확인 이중 가드 —
  복원↔제출 사이 중재 완료 레이스 차단. 중재 완료 주문이면 드래프트 파기 + 재제출 차단.

### 3-3. 다중 콜 방문 순서 보드 【R】

- **문제**: 다중 콜(최대 3건) 시 RunSwitcher가 created_at desc 나열뿐, 요약 쿼리에 좌표가 없어
  라이더가 주소를 읽고 머리로 순서를 계산한다.
- **동작**: useActiveRunSummaries select에 `pickup_location` 추가 → core `parseGeographyPoint`
  (S1 단일 파서) → 현재 위치 기준 Haversine 거리 칩(lib/geo.ts 재사용) + 근거리순 권장 순서
  뱃지 ①②③. ARRIVED(현장 진행 중)는 상단 고정. 좌표 null·위치 취득 실패 시 거리 미표기
  폴백(12 §S1 nullable 규약) + 해당 상태 테스트 케이스.
- **변경점**: DB·EF 0(본인 배정 주문은 기존 RLS로 전 컬럼 조회 가능). 표시 전용 — 배차·상태머신
  무관(13 D7 전체 공개 불변).

### 3-4. 콜 목록 정렬 토글 【R】 — 심사 공백 지적 반영

- **문제**: CallHomePage는 라이더가 하루 수십 회 여는 최고빈도 표면인데 정렬이 거리순 고정 —
  심사에서 "제안 전체가 콜 목록 탐색 효율을 다루지 않았다"고 지적된 공백.
- **동작**: 정렬 토글(가까운순[기본]·예상 지급액순·최신순). 예상 지급액 = 콜 카드가 이미
  계산하는 스냅샷 시세×신청량 재사용. 클라이언트 정렬 전용 — 배차 규칙(D7) 불변.

### 3-5. '알림 받기' 토글 실배선 【R】 — 퀵윈

- **문제**: 마이페이지 토글이 localStorage 저장만 되고 발화 주체(CallAlertListener)와 미배선 —
  야간·휴식 중 알림음을 끌 수 없다.
- **동작**: NOTIFY_PREF_KEY를 Zustand persist 스토어로 승격, CallAlertListener가 구독해
  `useCallAlert({ mute })`로 전달(이미 설계된 옵션에 배선만). 카피는 **"콜 알림음"**으로
  한정(서버 푸시까지 끈다는 오해 차단 — mute는 소리만, 배너·진동 유지 계약 준수).

## 4. 확인 교착 해소 (L5) — 리마인드·에스컬레이션

ARRIVED→COMPLETED는 supplier 전용이라 점주가 미루면 라이더는 현금을 건넨 채 무기한 대기 —
하루 동선 최대 병목. 해소 수단이 admin 수동 FORCE_COMPLETE + 24h 하이라이트뿐이었다.
**상태는 어떤 경로로도 바뀌지 않는다(§0-1) — 전부 알림.**

- 【EF】 order-expire cron에 ARRIVED 리마인드 단계 append(02-api §4 개정 포함):
  - 기산점: `order_events` 최근 SUBMIT_MEASURE의 created_at(L-D4 — 신규 컬럼 없음, 기존
    `idx_order_events_order` 인덱스 활용).
  - 제출 후 **2h·12h** 경과 시 supplier에게 `sendPushDeduped(kind=CONFIRM_REMIND_AUTO)` —
    수단별 카피 재사용("무게·현금 ₩N을 확인해 주세요"), link=`/orders/:id`.
  - **24h** 도달 시 admin에게 `CONFIRM_ESCALATION` 푸시 — 기존 OrdersPage 24h 하이라이트를
    능동 알림으로 승격, FORCE_COMPLETE 판단을 앞당긴다.
  - 매분 cron이므로 중복 발화는 L2 dedupe(kind+link+윈도)가 서버 강제. 단계 판정 로직은
    순수 헬퍼 분리 + deno test(§0-4).
- 【EF】 `confirm-remind` 신설: 라이더 [확인 요청 다시 보내기] 버튼 전용. 주문 당사자
  (rider_id=auth.uid()) + ARRIVED + 계량 제출됨 서버 검증 → supplier에게
  `CONFIRM_REMIND_MANUAL` 발송, **주문당 2시간 1회** rate-limit(L2 헬퍼 판정 — 클라 버튼
  비활성은 보조). 02-api.md 엔드포인트 추가.
- 【R】 ActiveRunPage '사장님 확인 대기' 배너에 버튼 1개([확인 요청 다시 보내기]) + 캡션
  "24시간이 지나면 본사에 자동 접수돼요"(L-D4 — 수동 에스컬레이션 버튼 없음).
- 【U】 리마인드 푸시 진입 시 OrderDetail 확인 카드로 자동 스크롤·강조(L-D8, 기존 카드 재사용).
- 【docs】 00-domain.md 알림 매트릭스에 2행 append(CONFIRM 리마인드 rider발→supplier /
  에스컬레이션 →admin) — 상태머신 표 불변.

## 5. 좌상 운영 (L6·L7·L8)

### 5-1. 관할 운영 관제 【DB】【D】 — 심사 2위(7.67)

- **문제**: 좌상 화면은 재무·실적뿐, 소속 라이더의 "지금 진행 중인 운행" 가시성이 0 —
  14 §2-5가 "운영 가시성 필요 시 재무 컬럼 제외 security_invoker 뷰로 별도"라고 자리를
  비워둔 곳. 교착 감지도 admin 24h 하이라이트 단일 창구.
- **동작**: ① 예약된 뷰 실행 — `v_dealer_active_orders`(security_invoker): 진행중
  (ACCEPTED/ARRIVED/DISPUTED) 주문의 **재무 컬럼 제외** 최소 컬럼(order_id·status·order_kind·
  rider_id·라이더 표시명·주소 요약·delivered_cans·accepted_at·arrived_at). 좌상은 14 §2-5
  스냅샷 정책(실명 `p_orders_read_by_dealer` — 이름 유지 재정의본)으로 자기 귀속분만.
  ② DealerHomePage '진행중 운행' 섹션 + arrived_at 기준 지연 배지(admin 24h 규칙 재사용)
  + 소속 라이더 **tel: CTA**(p_profiles_read_own_riders 기반) — 감지→개입이 화면 안에서 닫힘.
  ③ 조회 전용 — 좌상 상태 액션 없음(13 D3 불변).
- **심사 반영**: 라이더 표시명은 **left join + 폴백(rider_id 축약)** — 재배정 시 스냅샷 주문의
  이름이 비는 케이스를 pgTAP RLS 매트릭스에 포함. 갱신은 뷰 Realtime이 아니라 **pickup_orders
  postgres_changes 구독으로 invalidate**(라이더 앱 선례 — 뷰는 발행 대상이 아님).
  supplier 정보는 주소 요약 수준(PII 최소화). 라이더 실시간 위치는 당사자 전용(14 §6-2) 그대로.
- pgTAP: 타 좌상 0건·재무 컬럼 부재·재배정 표시명 폴백·진행중 상태 필터.

### 5-2. 정산 명세 셀프서비스 【D】 — 미정산 라인 + 청구 CSV

- **문제**: /statement는 4카드+청구 요약뿐 — "미정산 사용액 132만P"가 어느 주문에서 왔는지,
  청구 근거 주문이 무엇인지 좌상이 볼 수 없고, 대사용 CSV는 admin 전용. 14 §5 【D】가 명세한
  "미정산 라인"의 미구현분.
- **동작**: ① '미정산 내역' 섹션 — `v_dealer_settlement_orders`에서 `dealer_settlement_id is
  null` 본인 주문 목록 + 합계 행(usage 카드와 1:1 대사). ② 청구 이력 행별 [CSV] —
  `downloadSettlementCsv`를 공용 lib으로 추출해 admin/dealer 양쪽 재사용(L-D6: 컬럼은 뷰
  실컬럼 그대로, cash_paid_amount(총액)/net_amount 구분 표기).
- **변경점**: DB 0 — 뷰는 이미 security_invoker + grant authenticated, 스냅샷 RLS가 본인 행
  보장. DealerStatementPage 확장 + 함수 공용화만.

### 5-3. 정산 워치 【EF】【A】 — 크레딧 조기경보 + 청구 라이프사이클 알림

- **문제**: 임계 초과·한도 소진을 아무도 밀어주지 않는다 — admin이 화면을 열어야 배지를 보고,
  놓치면 CONFIRM에서 DEALER_LIMIT_EXCEEDED 하드스톱 → 라이더·점주가 현장에서 전액 현금
  재제출로 수습(14 §8). 청구 생성/정산 완료도 좌상은 새로고침해야 안다.
- **동작**: ① `settlement-watch` cron EF 신설(**15분 주기 권고** — order-expire는 1분 cron이므로
  '동일 주기' 아님, 02-api 신설 절에 주기·dedupe 윈도 명기): `v_dealer_statement`를
  service_role로 스캔, (a) usage/credit_limit **80% 밴드 진입**, (b) over_threshold 진입 시 해당
  좌상 + 전 admin에게 `sendPushDeduped`(kind=CREDIT_BAND_80/CREDIT_OVER_THRESHOLD, 24h 윈도).
  ② dealer-claim EF의 create/settle/void 성공 지점에 좌상 대상 notifications insert
  (CLAIM_CREATED/SETTLED/VOIDED — "청구 N원이 생성됐어요" 등). ③ 수신 표면은 **기존
  NotificationsBell 재사용**(AdminShell에서 dealer 포함 전 role 렌더 확인 — 신설 아님).
  D1 '별도 앱 없음' 전제상 FCM 토큰이 없어도 notifications 행이 남아 벨이 실수신 채널.
- **경계**: 자동청구 없음(14 §4) 불변 — 청구 생성·정산·무효는 계속 admin 수동(L-D5).
  밴드 판정은 순수 헬퍼 분리 + 테스트. FCM 미설정 시 push no-op·기록은 유지(12 §0-3 규약).

## 6. 라이더 관리·정산 가시화 (L9)

### 6-1. 라이더 관리 액션 완성 【D】

- **문제**: rider-verify Edge·useDealerScope는 4-decision(APPROVED/REJECTED/SUSPENDED/
  REINSTATED)+사유를 이미 지원하는데 UI는 3버튼뿐 — 좌상이 자기가 정지시킨 라이더를 못
  되돌리고, 반려 불가, 정지 사유 '좌상 정지' 하드코딩, 확인 다이얼로그 없이 오탭 정지.
- **동작**: verify_status별 액션 재구성 — PENDING→[승인]/[반려(사유 필수 모달)],
  APPROVED→[정지(사유 모달)], SUSPENDED→[정지 해제]. 파괴적 액션(반려·정지·소속 해제)에
  대상 라이더명·결과 명시 확인 다이얼로그. **서버·훅 변경 0**(이미 허용된 액션의 UI 노출 —
  권한 확대 없음, 전이 유효성은 Edge/guard가 최종 판정). 반려 안내 문구는 현행
  '고객센터 경유 재제출' 유지(라이더 앱 재제출 경로는 별건 gap).

### 6-2. 내 정산 현황 카드 【DB】【R】【EF】

- **문제**: 포인트 지급분의 라이더-플랫폼 정산 대사 근거 `v_rider_payout_daily`가 is_admin()
  게이트라 라이더 본인이 자기 정산 대기 금액을 볼 수 없다(08 P5 리스크 레지스터 [중]).
  추천 보상 정산 마킹(09 H8)도 라이더에게 무통지.
- **동작**: ① 신규 뷰 `v_my_payout_daily`(security_invoker, `rider_id = auth.uid()` 본인 스코프)
  — **미러 기준은 20260724000011의 net 기준 재정의본**(01에 보이는 구판 gross 정의 복제 금지 —
  14 §10-5 드리프트 재도입 차단). 기존 admin 뷰 불변. grant + pgTAP **'라이더가 타인 행
  0건' 필수**. ② EarningsPage '플랫폼 정산' 카드 — 이번 달 포인트 지급분 합계 + 캡션
  "오프라인 정산 대상 — 지급 일정은 본사 안내"(지갑/출금 오해 차단, 08 P5 불변).
  ③ referral-settle EF 성공 지점에 sendPush(kind=PAYOUT_REFERRAL_SETTLED) — **try-catch
  격리**(푸시 실패가 정산 마킹을 롤백하지 않도록). H8 '원장 발행 없음' 원칙 그대로.
- **[확장 2026-08-05, CEO 요청]** 실적에 **현금 지급 세부내역 병기** — ②의 정산 카드 안
  일별 접이식(포인트만)을 '일별 지급 내역' 카드(`daily-payout-card`)로 분리하고 일별
  건수/kg에 뷰의 `cash_amount`·`point_amount`를 병기(현금은 부호 보존 — 음수=상계 차액
  지급, 뷰 규약 그대로). 정산 카드는 합계+캡션 유지(② 불변). DB·뷰 변경 없음(【R】만).
- **[확장 2026-08-05 ②, CEO 요청]** 일별 카드에 **건별 펼침** — 날짜 행 `details` 펼침으로
  그날 완료 주문의 시각·주소·kg·수단별 지급액(useMyPayoutOrders — pickup_orders 본인 RLS,
  이번 달 로컬 경계, 최근 200건). 일별 행과 어긋나지 않도록 금액은 뷰와 동일 net 규약
  `coalesce(net_amount, cash_paid_amount)`, 일자 묶음은 **UTC 일자**(groupOrdersByUtcDay —
  로컬 날짜 묶음이면 KST 00~09시 완료 건이 다른 행에 붙는 확정 결함). 지급 없던 완료
  주문은 "지급 없음"(null≠0 구분). DB·뷰 변경 없음(【R】만).

## 7. 스코프 밖 (심사 탈락 4건 — 재론 조건 명시)

| 제안 | 사유 | 재론 조건 |
|---|---|---|
| 신유 재고 캔 카운터 | 14 §9 ⑧이 재고 수량관리를 **1차 제외로 명시(CEO 미확정)** — 이를 뒤집는 스코프 결정을 스펙 확정 없이 할 수 없다. 자동 차감을 fn_settle_trade 트랜잭션에 넣으면 정보성 수치가 금전 정산을 롤백시키는 역전 리스크 | 14 §9 ⑧ CEO 확정 + 차감의 정산 트랜잭션 격리 설계 |
| 좌상 창고 입고 대사(dealer_intakes 부활) | 14 §6-4가 '필요 시 별도 설계'로 유보한 L급 — 미입고 손실이 실제 발생하는지 운영 데이터 실증이 먼저. 스캔 노동을 추가하는 통제 기능이라 절감 효과 불명확 | 수기 대사에서 잡힌 미입고 손실 사례 확보 |
| 라이더 모집 전화번호 조회 | 전화번호 기반 타인 PII 반환은 13에 없는 신규 노출면 + rate-limit 저장소 미설계(무상태 EF로 불가) — 보안 리뷰 통과 불가 수준 | 열거 방어 설계(시도 기록 저장·마스킹) 선행 |
| 소멸 임박 콜 파이널 재공지 | 대상 라이더는 이미 15km 재브로드캐스트를 무시한 집단 — 4번째 푸시의 한계 회수율 낮고 콜 알림 채널 피로 리스크 | 기존 재브로드캐스트 카피에 예상 지급액 추가 실험 선행 |

## 8. 태스크 분해 (L) — 위에서부터 순서대로, 각 태스크 DoD 만족해야 종료

| # | 내용 | 범위 | 상태 |
|---|---|---|---|
| L1 | 스펙 확정 — 이 문서 + CLAUDE.md 문서 맵 등재 | 【docs】 | ✅ (2026-08-02) |
| L2 | 알림 계층 기반 — notifications.kind + idx + NOTIFY_KIND 상수 + sendPushDeduped(순수 판정 헬퍼 + 테스트) + 01 동기화 + pgTAP | 【DB】【EF】【core】 | ✅ (pgTAP 15 — 5, deno 7) |
| L3 | 라이더 현장 퀵윈 4종 — 경로·ETA(§3-1, 실 키 실측 선행 확인) · 방문 순서(§3-3) · 콜 정렬(§3-4) · 알림음 토글(§3-5) + 11 M9-b append + 03 동기화 | 【R】【core】【docs】 | ✅ (rider +10 테스트. 🔴 실 키 실측은 배포 후) |
| L4 | 계량 제출 드래프트(§3-2) — measureDraft 스토어 + 체크포인트 + 이중 재검증 가드 + fake-indexeddb 테스트 + 03 동기화 | 【R】 | ✅ (저장소 6 + 화면 5. effort M 재산정 반영) |
| L5 | 확인 교착 해소(§4) — order-expire 단계 append + confirm-remind 신설 + 대기 배너 버튼 + 【U】 확인 카드 앵커 + 00 알림 매트릭스·02 §4 개정 | 【EF】【R】【U】【docs】 | ✅ (deno 사다리 5 + rider 3. 기산점=order_events, L-D4) |
| L6 | 좌상 관제(§5-1) — v_dealer_active_orders 마이그레이션 + pgTAP + DealerHomePage 섹션(지연 배지·tel CTA) + 01 동기화 | 【DB】【D】 | ✅ (pgTAP 16 — 8, admin 4) |
| L7 | 정산 명세 셀프서비스(§5-2) — 미정산 섹션 + CSV 공용화 + 테스트 | 【D】 | ✅ (admin 3+1, lib/csv 재사용) |
| L8 | 정산 워치(§5-3) — settlement-watch 신설 + dealer-claim 알림 append + 02 신설 절 + DEPLOY cron 배선·수동 호출 검증 절차 | 【EF】【A】【docs】 | ✅ (deno 4, DEPLOY §1-4. 🔴 cron 실배선은 배포) |
| L9 | 라이더 관리 액션 완성(§6-1) + 내 정산 현황 카드(§6-2) — v_my_payout_daily 마이그레이션 + pgTAP + 화면 + referral-settle 푸시 | 【D】【DB】【R】【EF】 | ✅ (pgTAP 17 — 6, admin 5·rider 2) |
| L10 | 마감 — qa-checklist 갱신 · 벤더 재확인 · 게이트(pnpm lint/test/build + pgTAP) · 적대적 리뷰 · PR | 【검증】 | ✅ (게이트 전체 GREEN — pgTAP 17스위트 265, 아래 검증 기록) |

> **적대적 리뷰 결과(L10, 2026-08-02)** — 전체 diff 검토, **확정 결함 5건 발견·전량 수정**:
> ① [상] ArrivedPanel `key` 부재 — 다중 콜 ARRIVED↔ARRIVED in-place 전환(캐시 복귀·pickRun 폴백)
> 시 이전 주문의 폼 state·드래프트가 새 주문 키로 저장·오염 → 오제출 가능. `key={run.id}` 리마운트로 수정.
> ② [중] L8 알림 링크가 벨에서 전부 죽은 링크 — remapToAdminRoute 허용목록에 dealer 라우트
> (13/14 추가분) 누락 + 쿼리스트링 원천 매치 불가. 허용목록 갱신 + pathname 판정·쿼리 보존으로 수정.
> ③ [상] DEPLOY §1-4대로 cron 배선 시 매 주기 401 — requireAuth는 user JWT 전용이라 service_role
> JWT(sub 없음)가 항상 거부됐다. `requireCronAuth`(service_role 키 직접 인정 + admin JWT 폴백) 신설,
> order-expire·settlement-watch 적용. ④ [하] 알림음 레거시 이관이 재시작 1회에 유실(persist가 최초
> set 전 미저장) — write-through로 수정. ⑤ [하] useMyPayout "이번 달" 경계가 UTC 변환으로 KST
> 1일 00~09시에 전월로 밀림 — 로컬 달력 기준 조립으로 수정. 잠복 관찰 2건(에스컬레이션 다단계 확장 시
> dedupe 카운트 방식·order_events 1000행 캡)은 현 설정 무해로 기록만.
>
> **구현 편차 기록(L10)**: ① 자동 리마인드(2h/12h)는 사다리 특성상 단일 윈도 dedupe(sendPushDeduped)
> 대신 **발송 이력 개수 기반 판정**(`ladderShouldSend` 순수 함수)을 쓴다 — L-D2의 "단일 메커니즘"
> 취지는 유지(notifications 이력만 사용, 저장소 신설 없음)하되 판정 함수만 다르다. ② L5 라이더측
> [본사에 도움 요청] 버튼은 L-D4대로 제거(24h 자동 에스컬레이션과 중복) — 캡션 안내로 대체.
> ③ EF 정적 검증 중 **기존 잠복 타입 이슈 발견(수정 안 함, 범위 밖)**: order-transition:58의
> ACTION_ROLES 타입이 13에서 추가된 'dealer' role을 포함하지 않아 deno check 에러 — 런타임 무해
> (dealer는 어떤 액션에도 매칭되지 않아 FORBIDDEN 경로)이나 후속 정리 대상으로 기록.

DoD 공통: `pnpm lint && pnpm test && pnpm build` green, DB 태스크는 pgTAP green
(`bash scripts/pgtap-local/run.sh`), 시크릿 grep, 스키마 변경 시 01 동기화(규칙 6).
스펙 밖 판단이 불가피하면 04-tasks '질문 목록'에 경위 기록(관례).

## 9. 리스크 레지스터

- [중] **cron 미배선 → 리마인드·워치가 조용히 죽음.** DEPLOY.md 배선 체크리스트 + 수동
  invoke 검증 절차(§0-5)로 봉인. 배선 전에도 화면 기능(L3~L7)은 전부 독립 동작.
- [해소 2026-08-03] **KAKAO_MOBILITY_KEY 실측(11).** 프로덕션 키 등록 + 실 응답 파싱·경로선
  렌더 실측 완료 — §3-1 경로·ETA 활성. configured:false 폴백은 키 회수 시 안전망으로 유지.
- [중] **리마인드 남발 → 점주 알림 피로.** dedupe·rate-limit을 서버(EF) 강제, 주기(2h/12h/24h)
  고정, 클라 비활성은 보조. 카피는 지급 확정 유인 중심("확인하면 지급이 확정돼요").
- [하] 낡은 드래프트 오제출 — 복원·제출 직전 이중 재검증 가드(§3-2) + 저장 시각 표기.
- [하] v_my_payout_daily가 구판(gross) 정의를 복제하는 드리프트 — 20260724000011 기준 명시
  (§6-2) + pgTAP 값 assert.
- [하] 정산 카드의 지갑/출금 오해 — 카피로 차단(§6-2), 08 P5 불변.

## 10. 오픈 질문 (CEO 확인 — 권고 기본값으로 진행)

1. 확인 리마인드 주기 2h/12h(supplier)·24h(admin) — 권고안. 운영 데이터 확보 후 조정.
2. settlement-watch 주기 15분·경보 밴드 80% — 권고안(임계·한도는 기존 좌상별 설정 그대로).
3. 콜 목록 기본 정렬 = 가까운순 유지 — 권고안(토글 도입만).
4. 스코프 밖 2건(신유 재고·입고 대사)의 차수 편성 여부 — §7 재론 조건 충족 시 별도 문서.
