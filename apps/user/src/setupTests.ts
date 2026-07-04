import "@testing-library/jest-dom/vitest";

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
