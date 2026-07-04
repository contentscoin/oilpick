-- T7: apps/user U3 홈 "PriceCard(최신 tick, Realtime 구독)" (03-frontend.md)를 위해
-- price_ticks도 Realtime publication에 추가한다.
--
-- 20260704000002_storage_realtime.sql은 01-db-schema.sql 228행 주석
-- "Realtime publication: pickup_orders, notifications 활성화"만 그대로 옮겨 price_ticks가
-- 빠져 있었다. 03-frontend.md 55~61행(U3 절)은 "PriceCard(최신 tick, Realtime 구독)"을
-- 명시적으로 요구하므로, 이는 새로운 설계 판단이 아니라 스펙이 이미 요구한 내용을 위한
-- 스키마 보완이다(CLAUDE.md 규칙 6: "스키마 변경 시 01-db-schema.sql도 동기화").
alter publication supabase_realtime add table price_ticks;
