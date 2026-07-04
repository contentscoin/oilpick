import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

export interface SessionState {
  session: Session | null;
  /** 최초 세션 로드가 끝났는지(getSession 응답 도착 여부). 라우팅 가드에서 깜빡임 방지용. */
  loading: boolean;
}

/** 현재 Supabase Auth 세션 구독. U2 인증 가드와 홈 화면 등에서 공용으로 쓴다. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({ session: data.session, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({ session, loading: false });
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
