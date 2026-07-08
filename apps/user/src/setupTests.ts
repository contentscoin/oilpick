import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy*/waitFor 기본 1s는 부하 시 lazy 라우트 청크 로드보다 짧아 플레이크의 원인 —
// vite.config.ts의 testTimeout(20s)과 짝으로 전역 상향한다.
configure({ asyncUtilTimeout: 10_000 });

// jsdom에는 ResizeObserver가 없다 — recharts의 ResponsiveContainer(U4 시세 차트)가
// 마운트 시 이를 요구하므로 테스트 환경에서만 최소 폴리필을 등록한다.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}
