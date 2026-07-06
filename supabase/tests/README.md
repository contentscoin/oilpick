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

## 커버리지

- **01_ledger_money_test.sql** — 주문 완주 시 EARN=round(final_kg×snapshot_price),
  HOLD==RELEASE==snapshot_rider_fee, held→available 이동, 멱등(완료 주문 재전이 차단으로 이중지급
  없음), point_ledger append-only 트리거. (12 assertions)
- **02_state_machine_test.sql** — ACCEPT는 rider만, 재수락 ALREADY_ACCEPTED, 배정 안 된 라이더
  ARRIVE 불가, 라이더당 활성 주문 1건(부분 유니크 인덱스로 동시 이중배정 차단), 수락 후 공급자
  취소 불가(admin만). (8 assertions)
- **03_privilege_guards_test.sql** — authenticated는 profiles.role을 admin으로 못 올리고
  rider_profiles.verify_status를 셀프 APPROVED(insert/update) 못 하며, service_role(Edge Function)
  만 변경 가능. 정상 컬럼(fcm_token) 업데이트는 유지. (5 assertions)

이 시나리오들은 개발 중 실제 psql/curl로 수동 검증된 것을 pgTAP로 영구 자산화한 것이다.
향후 Postgres 서비스 컨테이너를 띄우는 별도 CI 잡에서 자동 실행하는 것을 검토(현재 GitHub Actions
CI에는 Supabase가 없어 미포함).
