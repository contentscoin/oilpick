import { useNavigate } from "react-router-dom";
import { colors, elevation, radius, frameFixedStyle, FRAME_MAX_WIDTH } from "@oilpick/ui";
import { useCallAlert } from "../hooks/useCallAlert";
import { useNotifyPref } from "../stores/notifyPref";

/**
 * 06 E3 — 콜 도착 포그라운드 알림 전역 리스너. App 루트(ToastProvider 안, Router 안)에 마운트되어
 * pickup_orders INSERT(Realtime)와 FCM foreground 이벤트를 감지해 배너/알림음/진동을 발화한다.
 * 구독/게이트/dedupe 로직은 useCallAlert 훅에 있고, 이 컴포넌트는 배너 표시 + 탭 이동만 담당한다.
 */

/** 배너 슬라이드다운 keyframes. 인라인 style로는 @keyframes를 못 쓰므로 <style>로 1회 주입. */
// [12 §8] 프레임 중앙 정렬(translateX(-50%))과 슬라이드다운을 합성한다. 애니메이션 transform이
// 인라인 translateX(-50%)를 통째로 덮으므로 keyframes에 translateX(-50%)를 함께 넣어야 가로 밀림이 없다.
const SLIDE_DOWN_CSS = `
@keyframes oilpick-call-alert-slide {
  from { transform: translateX(-50%) translateY(-100%); }
  to { transform: translateX(-50%) translateY(0); }
}
`;

export function CallAlertListener() {
  const navigate = useNavigate();
  // [16 L3 §3-5] 마이의 "콜 알림음" 토글 실배선 — mute는 소리만 끄고 배너·진동은 유지(훅 계약).
  const soundEnabled = useNotifyPref((s) => s.soundEnabled);
  const { alert, dismiss } = useCallAlert({ mute: !soundEnabled });

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
          // [12 §8] 프레임 폭 중앙 정렬 + 좌우 12px 여백 유지(모바일/데스크톱 공통).
          ...frameFixedStyle,
          width: "calc(100% - 24px)",
          maxWidth: FRAME_MAX_WIDTH - 24,
          /* 노치/상태바 아래에서 시작하도록 상단 safe-area 반영. */
          top: "calc(12px + env(safe-area-inset-top, 0px))",
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
