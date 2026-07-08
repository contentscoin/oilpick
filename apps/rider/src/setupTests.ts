import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy*/waitFor 기본 1s는 부하 시 lazy 라우트 청크 로드보다 짧아 플레이크의 원인 —
// vite.config.ts의 testTimeout(20s)과 짝으로 전역 상향한다.
configure({ asyncUtilTimeout: 10_000 });
