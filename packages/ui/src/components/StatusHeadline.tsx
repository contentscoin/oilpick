import { type OrderStatus } from "@oilpick/core";
import { colors, gray, radius } from "../tokens";

/**
 * 05-design-upgrade.md "주문 상세 상태 헤드라인" — U7 신규 패턴.
 * 배지 대신 큰 상태 문장 + 보조설명(DoorDash "Heading to you" 패턴).
 * 카피는 00-domain.md 상태 라벨과 일관되되 더 대화체.
 *
 * U7 목업 확정("## U7 주문상세 — 목업 확정"): 제목은 가독성을 위해 near-black(gray-900),
 * 우측에 상태 pill(진행 중=green / 완료=green / 취소됨=danger / 확인 중=wait / 요청됨=active).
 * subtitle/pill은 optional prop으로 오버라이드 가능(라이더명 포함 보조문구 등).
 */
export interface StatusHeadlineProps {
  status: OrderStatus;
  /** 우측 상태 pill 라벨 오버라이드. 미지정 시 status에서 자동 매핑. `null`이면 pill 숨김. */
  pill?: string | null;
  /** 보조문구 오버라이드(예: "김민준 라이더가 매장으로 이동 중이에요"). 미지정 시 status 기본값. */
  subtitle?: string;
  className?: string;
}

interface Headline {
  title: string;
  subtitle: string;
}

const HEADLINE: Record<OrderStatus, Headline> = {
  REQUESTED: {
    title: "주변 라이더를 찾고 있어요",
    subtitle: "가까운 라이더에게 요청을 보내는 중이에요.",
  },
  ACCEPTED: {
    title: "라이더가 배정됐어요",
    subtitle: "곧 라이더가 출발해요.",
  },
  ARRIVED: {
    title: "라이더가 도착했어요",
    subtitle: "현장에서 수거를 준비하고 있어요.",
  },
  // 07 F9-⑦: PICKED_UP/DELIVERED는 레거시(구모델) 전용 — 신규 주문은 도달 불가(신규 주문 화면에 미노출).
  // 프로덕션 잔존 주문 완결 표시용으로만 유지한다.
  PICKED_UP: {
    title: "수거가 완료됐어요",
    subtitle: "라이더가 집하장으로 이동 중이에요.",
  },
  DELIVERED: {
    title: "집하장에 전달됐어요",
    subtitle: "확정 계량 후 정산이 확정돼요.",
  },
  // 신 상태머신의 종착 상태 — 현장 현금 수령 확인(07 §1-3, D1). "배송"·"포인트" 표기 폐기.
  COMPLETED: {
    title: "수거가 완료됐어요",
    subtitle: "현금 수령이 확인됐어요.",
  },
  CANCELLED: {
    title: "주문이 취소됐어요",
    subtitle: "다시 수거를 요청할 수 있어요.",
  },
  DISPUTED: {
    title: "확인이 필요해요",
    subtitle: "운영팀이 내용을 확인하고 있어요.",
  },
};

interface Pill {
  label: string;
  color: string;
}

/** status → pill 라벨/색 자동 매핑. U7 목업 확정 규칙. */
const STATUS_PILL: Record<OrderStatus, Pill> = {
  REQUESTED: { label: "요청됨", color: colors.status.active },
  ACCEPTED: { label: "진행 중", color: colors.status.done },
  ARRIVED: { label: "진행 중", color: colors.status.done },
  PICKED_UP: { label: "진행 중", color: colors.status.done },
  DELIVERED: { label: "완료", color: colors.status.done },
  COMPLETED: { label: "완료", color: colors.status.done },
  CANCELLED: { label: "취소됨", color: colors.status.danger },
  DISPUTED: { label: "확인 중", color: colors.status.wait },
};

export function StatusHeadline({ status, pill, subtitle, className }: StatusHeadlineProps) {
  const base = HEADLINE[status];
  const autoPill = STATUS_PILL[status];
  // pill prop: 문자열이면 라벨 오버라이드(색은 status 매핑 유지), null이면 숨김, undefined면 자동.
  const pillLabel = pill === null ? null : (pill ?? autoPill.label);
  const resolvedSubtitle = subtitle ?? base.subtitle;
  return (
    <div className={className} data-testid="status-headline">
      {/* [03 레이아웃 강건성] 확대로 좁아지면 pill이 타이틀 아래 줄로 접힌다. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            color: gray[900],
            flex: 1,
            minWidth: 0,
          }}
        >
          {base.title}
        </h2>
        {pillLabel && (
          <span
            data-testid="status-headline-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
              padding: "4px 12px",
              borderRadius: radius.pill,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              color: autoPill.color,
              backgroundColor: `${autoPill.color}1A`,
            }}
          >
            {pillLabel}
          </span>
        )}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: colors.status.wait }}>
        {resolvedSubtitle}
      </p>
    </div>
  );
}
