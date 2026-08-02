-- [16 L2] 알림 계층 단일화 기반 — notifications.kind + dedupe 인덱스.
-- docs/spec/16-ops-convenience.md §2: 리마인드(L5)·정산 워치(L8)가 "최근에 같은 알림을
-- 보냈는가"를 판정해야 하는데 notifications에 분류 컬럼이 없어, EF마다 dedupe를 재발명하면
-- 알림 계층의 단일 진실이 무너진다. 판정은 _shared/push.ts sendPushDeduped 한 곳으로 모으고
-- DB는 분류 컬럼 + 조회 인덱스만 제공한다.
--
-- kind는 자유 text(체크 제약 없음) — 값 집합은 packages/core NOTIFY_KIND 상수가 단일 진실이고,
-- 새 kind 추가가 마이그레이션을 요구하지 않게 한다. 기존 행은 null(레거시 — 분류 이전 발송분,
-- dedupe 판정 대상 아님). 쓰기는 기존과 동일하게 Edge Function(service_role)만 — 클라이언트
-- insert 정책이 없는 현행 RLS 그대로(순수 추가, 정책 변경 0).

alter table notifications add column kind text;

comment on column notifications.kind is
  '[16 L2] 알림 분류(core NOTIFY_KIND). null=분류 이전 레거시. dedupe 판정 키(user_id, kind, link)';

-- sendPushDeduped의 판정 쿼리(user_id = ? and kind = ? [and link = ?] and created_at >= 윈도) 전용.
create index idx_notifications_dedupe on notifications (user_id, kind, created_at desc);
