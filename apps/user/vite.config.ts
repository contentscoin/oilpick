/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 무거운 vendor를 초기 index 청크에서 분리한다(순수 빌드 최적화, 로직/동작 변경 없음).
 * node_modules 경로 기반 분기 — 실제로 이 앱이 쓰는 vendor만 대상으로 한다.
 * (07 F8: U4 시세 화면이 recharts→순수 SVG PriceChart로 전환돼 'charts' 청크는 폐지.)
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
  if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "query";
  if (
    /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)
  ) {
    return "react";
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    // 이 개발 머신은 부하 시 lazy 라우트 청크 로드/이펙트가 수 초씩 걸려
    // 기본 5s testTimeout으로는 라우팅 테스트가 플레이크난다. setupTests.ts의
    // asyncUtilTimeout(10s)과 짝으로 상향.
    testTimeout: 20_000,
  },
});
