-- [09 H2] ledger_type enum에 'REFERRAL' 추가 (라이더 추천 활성화 시 점주 보너스 적립).
--
-- ALTER TYPE ... ADD VALUE로 추가한 값은 "같은 트랜잭션 안에서 사용"할 수 없다(PG12+ 제약,
-- 20260709000001 SUSPENDED와 동일 이유). 이 ADD VALUE만 별도 마이그레이션 파일로 분리해
-- 이후 파일(20260715000004 referrals RPC)이 REFERRAL을 안전하게 참조하게 한다.
-- 01-db-schema.sql:9 ledger_type 정의(REFERRAL 포함)와 동기화.
alter type ledger_type add value if not exists 'REFERRAL';
