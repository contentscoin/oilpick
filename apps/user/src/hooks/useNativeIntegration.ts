import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initNative, refreshPushRegistration } from "../lib/native";
import { supabase } from "../lib/supabaseClient";

/**
 * 네이티브(Capacitor) 통합을 앱 마운트 시 1회 초기화하는 훅.
 * 라우터 컨텍스트 안에서 호출해야 navigate로 딥링크 이동을 할 수 있다(App 내부에서 사용).
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

  // 앱 시작 시점에 아직 로그인 전이면 registration 리스너가 토큰을 저장하지 못한다
  // (push.saveFcmToken이 로그인 사용자 없으면 보류). 로그인 직후 재등록을 트리거해
  // 최신 토큰을 profiles.fcm_token에 저장하게 한다. 웹에서는 refreshPushRegistration이 no-op.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void refreshPushRegistration();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
