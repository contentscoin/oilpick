import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initNative, refreshPushRegistration } from "../lib/native";
import { supabase } from "../lib/supabaseClient";

/**
 * 네이티브(Capacitor) 통합을 앱 마운트 시 1회 초기화하는 훅(apps/rider).
 * 라우터 컨텍스트 안에서 호출해야 navigate로 딥링크 이동을 할 수 있다.
 * 웹에서는 initNative가 no-op이라 아무 부수효과도 없다.
 */
export function useNativeIntegration(): void {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initNative((path) => navigate(path))
      .then((fn) => {
        cleanup = fn;
      })
      .catch((err) => {
        console.error("네이티브 통합 초기화 실패", err);
      });
    return () => {
      cleanup?.();
    };
  }, [navigate]);

  // 로그인 직후 재등록 트리거(앱 시작 시 로그인 전이면 토큰 저장이 보류되므로). 웹에서는 no-op.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void refreshPushRegistration();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
