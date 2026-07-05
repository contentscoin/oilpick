/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 무거운 vendor를 초기 index 청크에서 분리한다(순수 빌드 최적화, 로직/동작 변경 없음).
 * rider는 recharts를 쓰지 않으므로 charts 분기는 없다. node_modules 경로 기반 분기.
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
    port: 5174,
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
  },
});
