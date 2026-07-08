-- [07 F2-⑦] verify_status enum에 'SUSPENDED' 추가 (라이더 정지 — 액션·정책은 F11).
--
-- ALTER TYPE ... ADD VALUE로 추가한 값은 "같은 트랜잭션 안에서 사용"할 수 없다(PG12+ 제약).
-- Supabase 마이그레이션은 파일 단위로 트랜잭션에 감싸 적용되므로, 이 ADD VALUE만 별도
-- 마이그레이션 파일로 분리해 이후 파일(F11 등)이 SUSPENDED를 안전하게 참조할 수 있게 한다.
-- F2 본 마이그레이션(다음 순번 20260709000002)은 SUSPENDED를 사용하지 않는 순수 스키마 추가다.
-- 01-db-schema.sql:11의 verify_status 정의(이미 SUSPENDED 포함)와 동기화.
alter type verify_status add value if not exists 'SUSPENDED';
