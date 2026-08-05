import { formatKg, formatKrw } from "@oilpick/core";
import { colors, elevation, gray, radius, surface } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — CallCard(거리/수량/쿠폰·매입액).
 * [17 Q3] "쿠폰 N장" 칩 복권(07 F5 원형, 08 G6-②의 역연산) — 우측 "예상 매입 지급액 ₩M"
 * (requested_kg×시세, 라이더가 점주에게 현금 또는 포인트로 지급할 금액)은 불변(17 C7),
 * 그 아래 소진 쿠폰 칩만 병기한다. couponCost 미지정/null(전환기 무쿠폰 주문)이면 미렌더.
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
  /** [17 Q3] 소진 쿠폰 장수(coupon_cost). null/미지정=전환기 무쿠폰 주문 → 칩 생략(17 C1). */
  couponCost?: number | null;
  /** 수거 주소(선택). 지정 시 제목 줄에 한 줄 truncate로 표시. */
  address?: string;
  /**
   * [N5] 점주 희망 시간(선택) — 'YYYY-MM-DD HH:mm' 또는 레거시 '지금'. 저장 문자열 그대로
   * 보조행 아래 줄에 "🕐 {값}"으로 표시. 없으면 미렌더.
   */
  preferredTime?: string | null;
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
  couponCost,
  address,
  preferredTime,
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
        // [03 레이아웃 강건성] 금액 pill을 고정 3열(auto)에서 빼고 본문 flexWrap 행으로 옮겼다 —
        // 확대 시 pill이 주소 칸을 압착하는 대신 다음 줄로 내려간다(금액 ellipsis 금지).
        gridTemplateColumns: "36px 1fr",
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

      {/* 본문: [수거지/거리·수량] + [금액 pill] flexWrap 행. 1x에서는 한 줄(제목 좌·pill 우),
          공간이 모자라면 pill이 다음 줄로 내려가 오른쪽 정렬(marginLeft:auto)을 유지한다. */}
      <span
        style={{
          minWidth: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 12,
          rowGap: 6,
        }}
      >
        {/* 수거지(제목) + 거리·수량(보조). basis 132px — 이보다 좁아지느니 pill을 내려보낸다. */}
        <span style={{ flex: "1 1 132px", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
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
          {/* [N5] 희망 시간 — 거리·수량 옆이 아니라 그 아래 줄(보조행 압착 방지). 값 없으면 미렌더.
              문자열은 저장값 그대로(레거시 "지금" 포함) — 좁은 폭에선 임의 지점 개행 허용. */}
          {preferredTime && (
            <span
              data-testid="call-card-preferred"
              className="oilpick-tabular-nums"
              style={{ fontSize: 12, fontWeight: 500, color: colors.status.wait, minWidth: 0, overflowWrap: "anywhere" }}
            >
              🕐 {preferredTime}
            </span>
          )}
        </span>

        {/* 예상 매입 지급액 — 목업 pill.lime(밝은 배경 위 lime.soft 배경 + primary.dark 텍스트,
            tokens.ts colors.lime 주석의 허용 조합). 라벨은 남긴다: 이 금액은 라이더가 "받는" 돈이
            아니라 점주에게 "지급할" 돈이라 숫자만 두면 뜻이 뒤집힌다. */}
        <span style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
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
              // 금액은 ellipsis·nowrap 금지 — 극단 확대에서는 pill 안에서 줄바꿈으로 흐른다.
            }}
          >
            {formatKrw(estimatedCash)}
          </span>
          {/* [17 Q3] 소진 쿠폰 칩 — 지급액 pill 아래 보조 칩(그린 soft). 수락에 드는 비용이라
              지급액과 시각 위계를 다르게 둔다. flexWrap 행에서 pill 열과 함께 통째로 접힌다. */}
          {couponCost != null && (
            <span
              className="oilpick-tabular-nums"
              data-testid="call-card-coupon"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 20,
                padding: "1px 8px",
                borderRadius: radius.pill,
                backgroundColor: colors.primary.light,
                color: colors.primary.dark,
                fontSize: 11,
                fontWeight: 700,
                // 칩도 금액과 같은 규약 — ellipsis·nowrap 금지(극단 확대 시 줄바꿈으로 흐른다).
              }}
            >
              쿠폰 {couponCost}장
            </span>
          )}
        </span>
      </span>
    </Tag>
  );
}
