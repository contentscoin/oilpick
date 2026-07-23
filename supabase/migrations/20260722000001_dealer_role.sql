-- [13 I1] 조직 계층 — 좌상(dealer) 역할 추가. docs/spec/13-org-dealer.md D1.
-- ⚠️ ALTER TYPE ... ADD VALUE는 같은 트랜잭션에서 그 값을 사용할 수 없다(Postgres 제약).
-- 따라서 enum 값 추가만 이 파일에 격리하고, 값을 참조하는 컬럼·함수·정책·뷰는
-- 다음 마이그레이션(20260722000002_dealer_org.sql)에서 정의한다.
alter type user_role add value if not exists 'dealer';
