import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * OS의 "동작 줄이기" 설정을 구독한다. 07-pivot-plan.md F7: "모든 모션은 prefers-reduced-motion 존중".
 * SSR/테스트(jsdom에 matchMedia 미구현) 환경에서는 안전하게 false를 반환한다.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const handler = () => setReduce(mq.matches);
    handler();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  return reduce;
}
