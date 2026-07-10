import { useNavigate } from "react-router-dom";
import { colors, elevation, radius } from "@oilpick/ui";
import { useCallAlert } from "../hooks/useCallAlert";

/**
 * 06 E3 — 콜 도착 포그라운드 알림 전역 리스너. App 루트(ToastProvider 안, Router 안)에 마운트되어
 * pickup_orders INSERT(Realtime)와 FCM foreground 이벤트를 감지해 배너/알림음/진동을 발화한다.
 * 구독/게이트/dedupe 로직은 useCallAlert 훅에 있고, 이 컴포넌트는 배너 표시 + 탭 이동만 담당한다.
 */

/** 배너 슬라이드다운 keyframes. 인라인 style로는 @keyframes를 못 쓰므로 <style>로 1회 주입. */
const SLIDE_DOWN_CSS = `
@keyframes oilpick-call-alert-slide {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
`;

export function CallAlertListener() {
  const navigate = useNavigate();
  const { alert, dismiss } = useCallAlert();

  if (!alert) return null;

  return (
    <>
      <style>{SLIDE_DOWN_CSS}</style>
      {/* OfflineBanner.tsx의 fixed 배너 패턴. zIndex 950 — OfflineBanner(1000)보다 아래. */}
      <button
        type="button"
        data-testid="call-alert-banner"
        aria-live="assertive"
        onClick={() => {
          dismiss();
          navigate(`/calls/${alert.orderId}`);
        }}
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 950,
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 56,
          padding: "12px 16px",
          borderRadius: radius.card,
          border: "none",
          backgroundColor: colors.primary.DEFAULT,
          boxShadow: elevation.raised,
          color: "#fff",
          fontSize: 15,
          fontWeight: 700,
          textAlign: "left",
          cursor: "pointer",
          animation: "oilpick-call-alert-slide 200ms ease-out",
        }}
      >
        <BellIcon />
        <span style={{ flex: 1, minWidth: 0 }}>{alert.message}</span>
      </button>
    </>
  );
}

/** 배너 좌측 벨 아이콘(흰색). */
function BellIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.4 2 6.2.5.5.1 1.3-.6 1.3H4.6c-.7 0-1.1-.8-.6-1.3.8-.8 2-2.2 2-6.2Z"
        stroke="#fff"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <path d="M10 19.5a2 2 0 0 0 4 0" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}
