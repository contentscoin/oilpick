import { type OrderStatus } from "@oilpick/core";
import { colors } from "../tokens";

/**
 * 05-design-upgrade.md "주문 상세 상태 헤드라인" — U7 신규 패턴.
 * 배지 대신 큰 상태 문장 + 보조설명(DoorDash "Heading to you" 패턴).
 * 카피는 00-domain.md 상태 라벨과 일관되되 더 대화체. 색은 status 토큰.
 */
export interface StatusHeadlineProps {
  status: OrderStatus;
  className?: string;
}

interface Headline {
  title: string;
  subtitle: string;
  color: string;
}

const HEADLINE: Record<OrderStatus, Headline> = {
  REQUESTED: {
    title: "주변 라이더를 찾고 있어요",
    subtitle: "가까운 라이더에게 요청을 보내는 중이에요.",
    color: colors.status.active,
  },
  ACCEPTED: {
    title: "라이더가 배정됐어요",
    subtitle: "곧 라이더가 출발해요.",
    color: colors.status.active,
  },
  ARRIVED: {
    title: "라이더가 도착했어요",
    subtitle: "현장에서 수거를 준비하고 있어요.",
    color: colors.status.active,
  },
  PICKED_UP: {
    title: "수거가 완료됐어요",
    subtitle: "라이더가 집하장으로 이동 중이에요.",
    color: colors.status.active,
  },
  DELIVERED: {
    title: "집하장에 전달됐어요",
    subtitle: "확정 계량 후 포인트가 지급돼요.",
    color: colors.status.done,
  },
  COMPLETED: {
    title: "배송까지 완료됐어요",
    subtitle: "포인트 지급이 확정됐어요.",
    color: colors.status.done,
  },
  CANCELLED: {
    title: "주문이 취소됐어요",
    subtitle: "다시 수거를 요청할 수 있어요.",
    color: colors.status.danger,
  },
  DISPUTED: {
    title: "확인이 필요해요",
    subtitle: "운영팀이 내용을 확인하고 있어요.",
    color: colors.status.wait,
  },
};

export function StatusHeadline({ status, className }: StatusHeadlineProps) {
  const { title, subtitle, color } = HEADLINE[status];
  return (
    <div className={className} data-testid="status-headline">
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: color,
          marginBottom: 10,
        }}
      />
      <h2
        style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1.25,
          letterSpacing: "-0.01em",
          color,
        }}
      >
        {title}
      </h2>
      <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.5, color: colors.status.wait }}>
        {subtitle}
      </p>
    </div>
  );
}
