import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { colors } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";

/**
 * R9 인증 카드. 03-frontend.md: "풀스크린 인증 카드 — 사진(placeholder 가능)/이름/차량번호 +
 * QR(rider_id 기반, T4에서 언급된 5분 만료 JWT 서명까지는 Phase 2 범위이므로 지금은 rider_id를
 * 담은 단순 QR로 충분)". QR payload는 `{ riderId }` JSON 문자열 — 서명/만료 없는 단순 식별자다.
 * Phase 2에서 JWT 서명 QR로 교체될 자리라는 점을 명확히 하려고 payload를 객체로 감쌌다.
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
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: 24,
        backgroundColor: colors.primary.DEFAULT,
        color: "#fff",
      }}
    >
      <div
        data-testid="badge-photo-placeholder"
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.15)",
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
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
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
