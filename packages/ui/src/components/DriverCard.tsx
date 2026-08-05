import { colors, elevation, radius, surface } from "../tokens";

/**
 * 05-design-upgrade.md "라이더/기사 카드" — U7 배정 후.
 * 아바타 원(이니셜) + 이름/"라이더" + 인증 배지(green pill) + 차량번호, 우측 전화 아이콘 버튼(tel:).
 * Uber/DoorDash driver-card 패턴. shadow-card.
 */
export interface DriverCardProps {
  /** 라이더 이름. 아바타 이니셜(첫 글자)로도 사용. */
  name: string;
  /** 차량번호(선택). */
  vehicleNo?: string;
  /** 전화번호(선택). 지정 시 우측에 tel: 링크 버튼을 노출. */
  phone?: string;
  /** 인증완료 배지 노출 여부. 기본 true. */
  verified?: boolean;
  className?: string;
}

function PhoneIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 4h3l1.2 3.2-1.8 1.4a11 11 0 0 0 4.5 4.5l1.4-1.8L18.5 12.5V15.5c0 1-.8 1.8-1.8 1.7A13.5 13.5 0 0 1 4.8 5.8C4.7 4.8 5.5 4 6.5 4Z"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DriverCard({ name, vehicleNo, phone, verified = true, className }: DriverCardProps) {
  const initial = name.trim().charAt(0) || "라";
  return (
    <div
      className={className}
      data-testid="driver-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 16,
        borderRadius: radius.card,
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
        boxShadow: elevation.card,
      }}
    >
      {/* 아바타 */}
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: colors.primary.light,
          color: colors.primary.dark,
          fontSize: 20,
          fontWeight: 800,
          // [03 레이아웃 강건성] 글자 확대 시 이니셜이 원 밖으로 삐져나오지 않게 원형 클립.
          lineHeight: 1,
          overflow: "hidden",
        }}
      >
        {initial}
      </span>

      {/* 이름 / 라이더 + 인증 + 차량번호 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* [03 레이아웃 강건성] 확대 시 이름·배지가 자연스럽게 두 줄로 떨어지게(행 접힘). */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, minWidth: 0 }}>{name}</span>
          <span style={{ fontSize: 13, color: colors.status.wait }}>라이더</span>
          {verified && (
            <span
              data-testid="driver-card-verified"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: radius.pill,
                fontSize: 12,
                fontWeight: 700,
                color: colors.primary.DEFAULT,
                backgroundColor: colors.primary.light,
              }}
            >
              인증완료
            </span>
          )}
        </div>
        {vehicleNo && (
          <p className="oilpick-tabular-nums" style={{ margin: "4px 0 0", fontSize: 14, color: colors.status.wait }}>
            {vehicleNo}
          </p>
        )}
      </div>

      {/* 전화 버튼 */}
      {phone && (
        <a
          href={`tel:${phone}`}
          data-testid="driver-card-call"
          aria-label={`${name} 라이더에게 전화`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: colors.primary.DEFAULT,
            boxShadow: elevation.card,
            textDecoration: "none",
          }}
        >
          <PhoneIcon />
        </a>
      )}
    </div>
  );
}
