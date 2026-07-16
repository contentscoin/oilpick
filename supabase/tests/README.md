# DB 회귀 테스트 (pgTAP)

돈이 걸린 SQL 계층(포인트 원장·상태머신·권한 가드)의 불변식을 자동 검증한다. 이 함수들
(`fn_transition_order`, `fn_post_ledger`, `fn_request_withdraw`, 권한 가드 트리거 등)을 수정할 때
회귀를 잡기 위한 것이다. 앱 vitest 스위트(CI)와 달리 **로컬 Supabase(Postgres)가 떠 있어야** 한다.

## 실행

```bash
supabase start          # 로컬 스택 (필요 시 --ignore-health-check)
pnpm test:db            # = supabase test db supabase/tests
```

`supabase test db`가 연결에 실패하면(로컬 스택 warmup/불안정), psql로 직접 실행할 수 있다:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f supabase/tests/01_ledger_money_test.sql
```

각 파일은 `begin … rollback`으로 격리되어 DB 상태를 남기지 않는다.

## 커버리지 (9스위트, 총 151 assertions)

- **01_ledger_money_test.sql** — 포인트 원장 무결성: EARN=round(final_kg×snapshot_price),
  레거시 HOLD/RELEASE 회귀, held→available 이동, 멱등(이중지급 없음), append-only 트리거. (15)
- **02_state_machine_test.sql** — ACCEPT는 rider만, 재수락 ALREADY_ACCEPTED, 배정 안 된 라이더
  ARRIVE 불가, 라이더당 활성 주문 1건(부분 유니크 인덱스), 수락 후 공급자 취소 불가(admin만),
  07 신경로(SUBMIT/CONFIRM_MEASURE·DISPUTE·FORCE_COMPLETE) 전이. (32)
- **03_privilege_guards_test.sql** — authenticated는 profiles.role 상승·verify_status 셀프
  APPROVED 불가(service_role만), 정상 컬럼(fcm_token) 업데이트 유지. (14)
- **04_legacy_flow_test.sql** — 구모델(PICKED_UP/DELIVERED) 잔존 주문 완결 회귀 — 신규 주문
  미도달 경로의 보존 동작. (6)
- **05_coupon_purchase_test.sql** — 쿠폰 구매/원장 레거시 보존: fn_charge/consume/confirm/refund
  멱등·잔액 음수 방지·append-only(08 P1 — 신규 발행 없음, 회계 기록 회귀). (21)
- **06_cs_tickets_test.sql** — CS 티켓 RLS(본인/admin)·작성자 role 위조 차단·admin 답변 컬럼 제한. (9)
- **07_rider_suspend_test.sql** — 라이더 정지(SUSPENDED): ACCEPT 게이트·오픈콜 RLS 차단·진행중
  주문 완결 허용. (9)
- **08_payout_method_test.sql** — 현장 지급수단(08): SUBMIT_MEASURE payoutMethod 검증·CASH 폴백,
  POINT 완료 시 EARN 1행(멱등)·CASH 무발행, 수단별 집계 뷰. (23)
- **09_referral_test.sql** — 레퍼럴(09): 오코드/미승인 라이더 거부, attach 정규화·스냅샷·멱등,
  다른 코드 재-attach ALREADY_REFERRED, 활성화 REFERRAL 발행·재활성화 no-op, v_referral_stats/
  v_referral_daily(교차일 버킷) 집계. (22)

이 시나리오들은 개발 중 실제 psql/curl로 수동 검증된 것을 pgTAP로 영구 자산화한 것이다.
어서션 수가 바뀌면 이 목록도 함께 갱신할 것(각 파일 상단 `select plan(N)`이 단일 진실).
향후 Postgres 서비스 컨테이너를 띄우는 별도 CI 잡에서 자동 실행하는 것을 검토(현재 GitHub Actions
CI에는 Supabase가 없어 미포함).
