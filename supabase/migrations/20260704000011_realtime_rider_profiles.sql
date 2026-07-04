-- rider_profiles Realtime publication 추가.
-- 근거: 03-frontend.md "apps/rider" 표 R1: "PENDING 대기 화면(Realtime으로
-- rider_profiles.verify_status 변경 감지해 자동 전환)" — 이 기능이 동작하려면
-- rider_profiles가 supabase_realtime publication에 있어야 하는데, 01-db-schema.sql/
-- 20260704000002_storage_realtime.sql은 pickup_orders/notifications만(이후
-- 20260704000009에서 price_ticks) 추가했다. 09-tasks.md T9 실제 브라우저 검증 중
-- (admin이 rider_profiles.verify_status를 APPROVED로 갱신해도 /verify 화면이 자동
-- 전환되지 않음) 이 공백을 실제로 확인했다 — T7의 price_ticks 누락과 동일한 종류의
-- 스키마 보완이라 새로운 설계 판단이 아니다(04-tasks.md 질문 목록에 기록).
alter publication supabase_realtime add table rider_profiles;
