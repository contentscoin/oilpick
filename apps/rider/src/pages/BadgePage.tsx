import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { elevation, gradient, radius, surface, surfaceDark } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";

/**
 * R9 인증 카드. 03-frontend.md: "풀스크린 인증 카드 — 사진(placeholder 가능)/이름/차량번호 +
 * QR(rider_id 기반, T4에서 언급된 5분 만료 JWT 서명까지는 Phase 2 범위이므로 지금은 rider_id를
 * 담은 단순 QR로 충분)". QR payload는 `{ riderId }` JSON 문자열 — 서명/만료 없는 단순 식별자다.
 * Phase 2에서 JWT 서명 QR로 교체될 자리라는 점을 명확히 하려고 payload를 객체로 감쌌다.
 *
 * 06 E12 — 명함형 히어로로 고도화: 단색 배경 → gradient.brand(딥그린 히어로), 하드코딩
 * 흰색/오버레이/반경을 surfaceDark·surface·radius 토큰으로 치환, 흰 QR 카드에 elevation.card.
 */
export function BadgePage() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useRiderProfile(userId);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const payload = JSON.stringify({ riderId: userId });
    QRCode.toDataURL(payload, { width: 240, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <main
      data-testid="badge-hero"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        background: gradient.brand,
        color: surfaceDark.textOnDark,
      }}
    >
      <div
        data-testid="badge-photo-placeholder"
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          backgroundColor: surfaceDark.pill,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
        }}
      >
        🚚
      </div>

      <div style={{ textAlign: "center" }}>
        <p data-testid="badge-name" style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          {profile?.displayName ?? "라이더"}
        </p>
        <p data-testid="badge-vehicle-number" style={{ margin: "4px 0 0", fontSize: 16, opacity: 0.9 }}>
          {profile?.vehicleNumber ?? ""}
        </p>
        {profile?.verifyStatus === "APPROVED" && (
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.85 }}>인증된 라이더</p>
        )}
      </div>

      <div
        data-testid="badge-qr-card"
        style={{
          backgroundColor: surface.card,
          borderRadius: radius.card,
          boxShadow: elevation.card,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {qrDataUrl ? (
          <img data-testid="badge-qr-image" src={qrDataUrl} alt="라이더 인증 QR" width={240} height={240} />
        ) : (
          <div style={{ width: 240, height: 240 }} />
        )}
      </div>
    </main>
  );
}
