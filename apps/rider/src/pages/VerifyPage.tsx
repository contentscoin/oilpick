import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { colors, radius } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";

/**
 * R1 PENDING 대기 화면. 03-frontend.md: "PENDING 대기 화면(Realtime로 승인 감지)".
 * useRiderProfile이 rider_profiles.verify_status의 UPDATE를 Realtime으로 구독하므로,
 * admin이 rider-verify로 승인 처리하면 이 화면이 폴링 없이 자동으로 "/"(콜 홈)로 전환된다.
 */
export function VerifyPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: rider, isLoading } = useRiderProfile(userId);

  useEffect(() => {
    if (rider?.verifyStatus === "APPROVED") {
      navigate("/", { replace: true });
    }
  }, [rider?.verifyStatus, navigate]);

  if (isLoading) {
    return (
      <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
        <div data-testid="verify-skeleton" style={{ height: 160, borderRadius: radius.card, backgroundColor: "#f4f4f5" }} />
      </main>
    );
  }

  const status = rider?.verifyStatus ?? "PENDING";

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        minHeight: "100vh",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56 }} aria-hidden>
        {status === "REJECTED" ? "😥" : "⏳"}
      </div>
      {status === "REJECTED" ? (
        <>
          <h1 data-testid="verify-rejected-title" style={{ fontSize: 20, margin: 0 }}>
            서류 심사가 반려되었어요
          </h1>
          {rider?.rejectReason && (
            <p style={{ margin: 0, fontSize: 14, color: colors.status.danger }}>{rider.rejectReason}</p>
          )}
          <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
            고객센터로 문의해주시면 도와드릴게요.
          </p>
        </>
      ) : (
        <>
          <h1 data-testid="verify-pending-title" style={{ fontSize: 20, margin: 0 }}>
            서류를 심사하고 있어요
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
            승인이 완료되면 자동으로 콜 홈으로 이동해요.
          </p>
        </>
      )}
    </main>
  );
}
