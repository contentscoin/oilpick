import { formatKg, formatKrw } from "@oilpick/core";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — CallCard(거리/수량/매입액).
 * [08 G6-②] "쿠폰 N장 소진" 칩 제거(쿠폰 모델 폐기) — 우측은 "예상 매입 지급액 ₩M"
 * (requested_kg×시세, 라이더가 점주에게 현금 또는 포인트로 지급할 금액)만 남는다.
 *
 * [15] beUI 목업 "01 콜 홈 — Toast Stack" 행 구조로 재구성한다.
 * `[36px 원형 아이콘] [수거지 / 거리·수량] [금액 pill]` 3열 그리드.
 * 예전 레이아웃은 좌측에 거리 숫자를 22px로 크게 세우고 우측에 금액을 20px 앰버로 세워
 * **한 카드 안에 큰 숫자가 둘** 있었다 — 목록으로 쌓이면 무엇을 먼저 읽어야 할지 흔들린다.
 * 목업은 "어디(제목) / 조건(보조) / 얼마(pill)" 한 방향으로만 읽히게 만든다.
 *
 * apps/rider R2 콜 홈 목록에서 쓰인다. 거리·매입액 계산은 클라이언트 책임 —
 * 이 컴포넌트는 계산된 값만 받는다.
 */
export interface CallCardProps {
  /** 거리(km). 소수 1자리로 표시. null이면 좌표 없음/위치 미확보 — "—"로 표시. */
  distanceKm: number | null;
  /** 예상 수거량(kg). */
  estimatedKg: number;
  /** 예상 매입 지급액(원) = requested_kg × snapshot_price_per_kg. 현장에서 현금/포인트로 지급. */
  estimatedCash: number;
  /** 수거 주소(선택). 지정 시 제목 줄에 한 줄 truncate로 표시. */
  address?: string;
  onClick?: () => void;
  className?: string;
}

/** 새 콜(브로드캐스트) 아이콘 — 목업 toast-icon의 radio-tower 자리. */
function CallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <circle cx="12" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M7.4 13.4a6.5 6.5 0 0 1 0-9.8M16.6 3.6a6.5 6.5 0 0 1 0 9.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M11 10.6 9.4 20M13 10.6 14.6 20M10.2 16.4h3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CallCard({
  distanceKm,
  estimatedKg,
  estimatedCash,
  address,
  onClick,
  className,
}: CallCardProps) {
  const Tag = onClick ? "button" : "div";
  const kg = formatKg(estimatedKg);
  const distance = distanceKm == null ? "—km" : `${distanceKm.toFixed(1)}km`;
  // 주소가 있으면 그것이 제목이고 수량은 보조 줄로 내려간다. 주소가 없는(비정상) 콜은
  // 수량이 제목 자리를 대신한다 — 같은 값을 두 줄에 겹쳐 쓰지 않는다.
  const title = address ?? kg;
  const subtitle = address ? `${distance} · ${kg}` : distance;

  return (
    <Tag
      className={className}
      data-testid="call-card"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        border: `1px solid ${surface.border}`,
        cursor: onClick ? "pointer" : "default",
        borderRadius: radius.card,
        padding: "14px 16px",
        backgroundColor: surface.card,
        boxShadow: elevation.card,
        minHeight: 48,
      }}
    >
      {/* 좌: 원형 아이콘(그린 채움) — 예전 좌측 액센트 바를 대신한다. */}
      <span
        aria-hidden
        style={{
          display: "grid",
          placeItems: "center",
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: colors.primary.DEFAULT,
          color: "#fff",
        }}
      >
        <CallIcon />
      </span>

      {/* 중앙: 수거지(제목) + 거리·수량(보조) */}
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: gray[900],
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <span
          className="oilpick-tabular-nums"
          style={{ fontSize: 13, fontWeight: 500, color: colors.status.wait }}
        >
          {subtitle}
        </span>
      </span>

      {/* 우: 예상 매입 지급액 — 목업 pill.lime(밝은 배경 위 lime.soft 배경 + primary.dark 텍스트,
          tokens.ts colors.lime 주석의 허용 조합). 라벨은 남긴다: 이 금액은 라이더가 "받는" 돈이
          아니라 점주에게 "지급할" 돈이라 숫자만 두면 뜻이 뒤집힌다. */}
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {/* 라벨은 "지급액"으로 줄인다 — "예상 매입 지급액"은 폭을 110px 넘게 먹어 정작 중요한
            수거지 주소가 두세 글자만 남고 잘렸다. 전체 문구는 접근성 이름으로 남긴다. */}
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.status.wait }}>지급액</span>
        <span
          className="oilpick-tabular-nums"
          data-testid="call-card-cash"
          aria-label={`예상 매입 지급액 ${formatKrw(estimatedCash)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 26,
            padding: "0 10px",
            borderRadius: radius.pill,
            backgroundColor: colors.lime.soft,
            color: colors.primary.dark,
            fontSize: 15,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {formatKrw(estimatedCash)}
        </span>
      </span>
    </Tag>
  );
}
