-- [08 Q1] ledger_type enum에 'WITHDRAW_FEE' 추가 (출금 신청 1회당 수수료 1,000P 차감).
--
-- ALTER TYPE ... ADD VALUE로 추가한 값은 "같은 트랜잭션 안에서 사용"할 수 없다(PG12+ 제약,
-- 20260715000003 REFERRAL과 동일 이유). 이 ADD VALUE만 별도 마이그레이션 파일로 분리해
-- 다음 파일(20260806000002 출금 수수료 RPC 개정)이 WITHDRAW_FEE를 안전하게 참조하게 한다.
-- 01-db-schema.sql:12 ledger_type 정의(WITHDRAW_FEE 포함)와 동기화.
alter type ledger_type add value if not exists 'WITHDRAW_FEE';
