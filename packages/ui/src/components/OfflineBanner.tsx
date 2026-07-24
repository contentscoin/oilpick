import { useEffect, useState } from "react";
import { colors } from "../tokens";
import { frameFixedStyle } from "./MobileFrame";

/**
 * 03-frontend.md "공통 규칙" — 오프라인 감지 배너.
 * 네트워크 연결이 끊기면(navigator.onLine === false) 화면 최상단에 고정 배너를 표시한다.
 *
 * apps/user·apps/rider가 App 루트에 한 번만 마운트해 공유한다(per-page 셸 래핑과 무관하게
 * 항상 최상단에 뜨도록). 온라인 복귀 시 배너는 사라지고, TanStack Query의 재시도(retry)와
 * refetchOnReconnect가 데이터를 자동 갱신한다 — 이 컴포넌트는 표시만 담당한다.
 */

/**
 * navigator.onLine + online/offline 이벤트를 구독해 현재 온라인 여부를 반환하는 훅.
 * SSR/테스트 환경(navigator 미정의)에서는 기본값 true(온라인)로 동작한다.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    // 마운트 시점의 실제 상태로 한 번 동기화(이벤트를 놓친 경우 대비).
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

export interface OfflineBannerProps {
  /** 표시 문구 오버라이드(기본: 한국어 안내). */
  message?: string;
  className?: string;
  /** 온라인이어도 강제 표시 — /dev-ui 프리뷰 전용(프로덕션 경로에서 쓰지 말 것). */
  forceVisible?: boolean;
}

export function OfflineBanner({
  message = "인터넷 연결이 끊겼어요. 연결이 복구되면 자동으로 새로고침돼요.",
  className,
  forceVisible,
}: OfflineBannerProps) {
  const online = useOnlineStatus();
  if (online && !forceVisible) return null;

  return (
    <div
      role="alert"
      data-testid="offline-banner"
      className={className}
      style={{
        // [12 §8] 뷰포트 고정을 유지하되 모바일 프레임 폭(420)에 중앙 정렬(데스크톱).
        ...frameFixedStyle,
        top: 0,
        zIndex: 1000,
        /* 노치/상태바 아래로 내용이 깔리지 않게 상단 safe-area만큼 패딩(배경은 최상단까지 채움). */
        padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 10px",
        textAlign: "center",
        fontSize: 14,
        fontWeight: 600,
        color: "#fff",
        backgroundColor: colors.status.danger,
      }}
    >
      {message}
    </div>
  );
}
