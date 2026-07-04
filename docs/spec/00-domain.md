# 00. 도메인 스펙 (단일 진실)

## 용어 (코드 네이밍 고정)
| 한글 | 코드 | 설명 |
|---|---|---|
| 사용자(공급업체) | `supplier` | 폐식용유 배출·판매하는 매장 |
| 라이더(수거업체) | `rider` | 콜 수락 → 수거 → 집하장 배송 |
| 회사(관리자) | `admin` | 시세/수거비 결정, 정산, 검수 |
| 수거 주문 | `pickup_order` | 수거 요청 1건 |
| 시세 | `price_tick` | 매입가 (원/kg) |
| 수거비 | `rider_fee` | 회사가 라이더에게 주는 용역비 (P) |
| 포인트 | `point` | 1P = 1원. 정수 |
| 집하장 | `depot` | 지정 배송지 |

## 주문 상태머신

상태: `REQUESTED → ACCEPTED → ARRIVED → PICKED_UP → DELIVERED → COMPLETED`
예외: `CANCELLED`, `DISPUTED`

| 전이 | 트리거(actor) | 가드 조건 | 부수효과 |
|---|---|---|---|
| (생성)→REQUESTED | supplier | 진행중 주문 3건 미만 | 시세/수거비 스냅샷 저장, 매칭 브로드캐스트 시작 |
| REQUESTED→ACCEPTED | rider | 라이더 verified & online & 진행중 주문 없음. **선착순 1명** (동시성: `UPDATE ... WHERE status='REQUESTED'` 조건부 갱신으로 락) | supplier 푸시 "라이더 배정" |
| ACCEPTED→ARRIVED | rider | 배정 라이더 본인 | supplier 푸시 "도착" |
| ARRIVED→PICKED_UP | rider | 계량값(kg) 입력 + 현장 사진 ≥1장 업로드 + **supplier가 앱에서 확인 승인** | ① supplier에 `EARN` = round(확정kg × 시세) ② rider에 `HOLD` = 수거비. 푸시 양쪽 |
| ARRIVED→DISPUTED | supplier | 계량 이의신청 (사유 텍스트 필수) | admin 알림 |
| DISPUTED→PICKED_UP | admin | 중재 수량 확정 | 위와 동일 지급 (중재 수량 기준) |
| PICKED_UP→DELIVERED | rider | 집하장 QR 코드 스캔 검증 (depot.qr_secret 일치) | rider `HOLD` → `RELEASE` (지급 확정). 푸시 |
| DELIVERED→COMPLETED | 시스템 | DELIVERED 즉시 자동 | 별점 요청 푸시(선택) |
| REQUESTED→CANCELLED | supplier 또는 시스템 | 수락 전 언제나 / 브로드캐스트 30분 무수락 시 자동 | supplier 푸시 |
| ACCEPTED→CANCELLED | admin만 | 라이더 노쇼 등 | REQUESTED로 재생성 여부는 admin 수동 |

- 모든 전이는 `order_events`에 (order_id, from, to, actor_id, payload jsonb) append.
- 잘못된 전이 요청은 409 에러. 상태머신 검증 함수는 `packages/core/src/orderMachine.ts`에
  순수 함수로 구현하고 Edge Function과 클라이언트 UI(버튼 노출)가 공유한다.

## 매칭 규칙
1. REQUESTED 시 매장 위치 반경 **3km** 내 `online & verified & 진행중 주문 없음` 라이더 전원에게 푸시.
2. 5분 무수락 → 반경 **7km** 재브로드캐스트. 다시 5분 → **15km**. 30분 무수락 → 자동 CANCELLED
   (사유: `NO_RIDER`) + supplier에게 안내 푸시 + admin 알림.
3. 수락은 선착순. 두 번째 이후 수락 시도는 409 `ALREADY_ACCEPTED`.

## 포인트 원장 규칙
- `point_ledger`는 **append-only**. UPDATE/DELETE 금지 (트리거로 차단).
- entry_type: `EARN`(supplier 매각대금) `HOLD`(rider 수거비 보류) `RELEASE`(보류 확정)
  `WITHDRAW_REQUEST`(출금 신청 시 차감) `WITHDRAW_CANCEL`(반려 시 복구) `ADJUST`(admin 수동) `PURCHASE`(쇼핑몰, Phase 5)
- 부호 규칙: 잔액 증가 = 양수, 감소 = 음수. HOLD는 `held` 컬럼 별도 집계 (잔액에 미포함, "보류 중" 표시용).
  - PICKED_UP: rider에 HOLD(+fee, held로 집계) — 사용 가능 잔액 아님
  - DELIVERED: RELEASE 행 추가 → held에서 빠지고 available로 이동
- 출금: 신청 시 `WITHDRAW_REQUEST`(-금액) 즉시 차감 → admin 승인(이체는 수동) 또는 반려(`WITHDRAW_CANCEL` +금액).
  최소 출금 10,000P. 잔액 초과 신청은 400.
- 잔액 조회는 `v_point_balance` 뷰만 사용 (user_id, available, held).
- 불변식(테스트로 검증): 주문 1건 COMPLETED 시 원장 합 = supplier EARN + rider HOLD + rider RELEASE이고
  HOLD 금액 == RELEASE 금액 == 주문 스냅샷 rider_fee.

## 시세 규칙
- admin이 (원/kg 매입가, 수거비 기본값 P) 설정 → `price_ticks` insert (effective_at now).
- 현재 시세 = effective_at 최신 1건. 그래프는 price_ticks 시계열 그대로.
- 수거비는 기본값이지만 주문별로 admin이 사전 조정 가능한 구조는 만들지 않는다 (Phase 1 범위 밖). 스냅샷은 주문 생성 시 최신 tick에서.

## 계량/수량 규칙
- supplier 요청 시 입력: 통 수(18L 통 기준) 또는 kg 직접 입력. 예상 kg = 통 수 × 15kg (상수 `KG_PER_CAN = 15`).
- 예상 포인트 = 예상 kg × 시세 (UI 표시용, "현장 계량 기준으로 확정됩니다" 문구 필수).
- 확정 포인트 = 라이더 계량 kg × 스냅샷 시세, 원 단위 반올림.

## 라이더 인증
- 가입 시 서류 3종 업로드(사업자등록증, 차량 사진, 폐기물 수집·운반 허가증 — 허가증은 선택).
- rider_profiles.verify_status: `PENDING → APPROVED | REJECTED` (admin 검수).
- APPROVED 전에는 콜 목록 조회/수락 불가 (RLS + API 가드).
- 인증 QR: rider_id + 발급시각 서명 토큰(JWT, 5분 만료)을 R9 화면에 표시. supplier 앱에서 스캔 검증(Phase 1은 화면 제시만, 스캔 검증은 Phase 2).

## 알림 매트릭스 (푸시 + notifications 테이블 기록)
| 이벤트 | supplier | rider | admin(웹 알림) |
|---|---|---|---|
| 라이더 배정 | ✅ | ✅(본인 확정) | |
| 도착 | ✅ | | |
| 계량 확인 요청 | ✅ | | |
| 포인트 지급(EARN) | ✅ | | |
| 배송완료/RELEASE | | ✅ | |
| 신규 콜 | | ✅(반경 내) | |
| 이의신청 | | ✅ | ✅ |
| 출금 신청/처리 | ✅ | ✅ | ✅(신청) |
| 인증 승인/반려 | | ✅ | |
| 30분 무수락 취소 | ✅ | | ✅ |
