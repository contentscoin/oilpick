import { formatPoint } from "@oilpick/core";
import { colors, gray, radius, surface } from "../tokens";

/**
 * 18-dealer-credit-share.md R6 — 라이더가 "내가 지금 포인트로 얼마까지 지급할 수 있나"를 보는 게이지.
 *
 * 왜 필요한가(18 X2): 한도 초과는 점주가 [확인]을 누르는 순간 터진다. 정작 원인 제공자인 라이더는
 * 자기 잔여를 볼 방법이 없어 현장에서 왕복이 생겼다. 이 게이지 + 제출 전 fail-fast(R7)가 그 에러가
 * 점주에게 도달하지 않게 막는다.
 *
 * 모드 구분(R6):
 * - PER_RIDER: 나에게 배분된 개인 한도. 라벨 "내 포인트 지급 한도".
 * - POOL: 좌상 총량을 소속 라이더가 공유(선착순). 라벨 "좌상 공용 한도" — 내 몫이 따로 없다는
 *   사실 자체가 정보다(다른 라이더가 먼저 쓰면 줄어든다는 캡션).
 *
 * 임계 색상: 잔여 비율 ≥30% 브랜드 그린 / 10~30% 경고 앰버 / <10% 위험 레드.
 * [M] 글자 확대 대응: 고정 height 금지(minHeight+padding), 수치 행 flexWrap, 라벨만 ellipsis.
 */
export interface CreditGaugeBarProps {
  /** 한도(P). null이면 한도 없음(본사 직속·계정 미설정) — 호출부가 렌더를 생략하는 편이 낫다. */
  limitAmount: number | null;
  /** 사용액(P). 미정산 POINT 지급 순액. */
  used: number;
  /** 잔여(P). 서버 계산값(음수는 0으로 클램프된 값)을 그대로 받는다. */
  available: number;
  /** 배분 모드. POOL이면 좌상 공용 한도로 표기한다. */
  allocationMode: "POOL" | "PER_RIDER" | null;
  /** 이번 건 예상 지급액(P). 지정하면 초과분을 게이지에 빗금으로 예고한다(R7 fail-fast 보조). */
  pendingAmount?: number;
  className?: string;
  "data-testid"?: string;
}

export function CreditGaugeBar({
  limitAmount,
  used,
  available,
  allocationMode,
  pendingAmount,
  className,
  "data-testid": testId,
}: CreditGaugeBarProps) {
  // 한도 미설정(무제한)은 게이지로 표현할 수 없다 — 호출부가 걸러야 하지만 방어적으로 null 반환.
  if (limitAmount == null || limitAmount <= 0) return null;

  const usedRatio = Math.min(1, Math.max(0, used / limitAmount));
  const availableRatio = 1 - usedRatio;
  // 이번 건까지 반영한 예상 사용률(초과 시 1로 클램프해 바 밖으로 새지 않게).
  const pendingRatio =
    pendingAmount != null && pendingAmount > 0
      ? Math.min(1 - usedRatio, pendingAmount / limitAmount)
      : 0;
  const willExceed = pendingAmount != null && pendingAmount > available;

  const barColor = willExceed
    ? colors.status.danger
    : availableRatio >= 0.3
      ? colors.primary.DEFAULT
      : availableRatio >= 0.1
        ? colors.accent.deep // 경고 티어 — 앰버(별도 warn 토큰 없음, 05 accent 재사용)
        : colors.status.danger;

  const isPool = allocationMode === "POOL";

  return (
    <section
      data-testid={testId ?? "credit-gauge"}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 14,
        borderRadius: radius.card,
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: gray[900],
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {isPool ? "좌상 공용 한도" : "내 포인트 지급 한도"}
        </span>
        <span
          data-testid="credit-gauge-available"
          className="oilpick-tabular-nums"
          style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: barColor }}
        >
          {formatPoint(available)}
        </span>
        <span style={{ fontSize: 12, color: colors.status.wait }}>남음</span>
      </div>

      {/* 게이지 — 사용(진한) + 이번 건 예고(반투명). 바 자체는 장식이라 aria로 수치를 노출한다. */}
      <div
        role="progressbar"
        aria-label={isPool ? "좌상 공용 포인트 한도 사용률" : "내 포인트 지급 한도 사용률"}
        aria-valuemin={0}
        aria-valuemax={limitAmount}
        aria-valuenow={used}
        style={{
          display: "flex",
          minHeight: 10,
          borderRadius: 999,
          backgroundColor: gray[100],
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${usedRatio * 100}%`, backgroundColor: barColor }} />
        {pendingRatio > 0 && (
          <div
            data-testid="credit-gauge-pending"
            style={{ width: `${pendingRatio * 100}%`, backgroundColor: barColor, opacity: 0.4 }}
          />
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: colors.status.wait }}>
        <span className="oilpick-tabular-nums">
          사용 {formatPoint(used)} / 한도 {formatPoint(limitAmount)}
        </span>
        {isPool && <span>· 소속 라이더가 함께 쓰는 한도예요</span>}
      </div>

      {willExceed && (
        <p data-testid="credit-gauge-exceed" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.status.danger }}>
          이번 건 {formatPoint(pendingAmount ?? 0)}은 남은 한도를 넘어요 — 현금 지급으로 진행해주세요.
        </p>
      )}
    </section>
  );
}
