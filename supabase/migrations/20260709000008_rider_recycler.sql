-- [07 F11-③] 인계처(허가 재활용업체) 등록 — rider_profiles에 recycler 컬럼 추가.
--
-- D5(CEO 승인, 07 §0): 라이더가 수거한 기름은 "허가 재활용업체에 인계(매각)"한다. 이 인계처는
-- 라이더 승인 조건(승인 시 서버 필수 검증 — rider-verify approve). 원장/시세 같은 무결성 객체가
-- 아니라 본인 프로필 텍스트 필드이므로 guard_rider_verify(verify_status/reject_reason만 보호)에
-- 걸리지 않고 라이더 본인 update가 허용된다(p_rider_self RLS 범위 내 — 자연스러운 설계).
-- 01-db-schema.sql:39-52 rider_profiles 정의와 동기화(예약 마커 [07 F11] 실 DDL로 교체).
alter table rider_profiles
  add column if not exists recycler_name text,
  add column if not exists recycler_contact text;

comment on column rider_profiles.recycler_name is '인계 재활용업체명(승인 조건, 07 F11 D5)';
comment on column rider_profiles.recycler_contact is '인계 재활용업체 연락처(승인 조건, 07 F11 D5)';
