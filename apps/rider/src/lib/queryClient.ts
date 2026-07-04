import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query 클라이언트. 03-frontend.md "공통 규칙":
 * "데이터 fetching: TanStack Query. queryKey 컨벤션 ['orders', id], ['balance', userId] 등.
 * Realtime 이벤트 수신 시 해당 queryKey invalidate."
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/** queryKey 컨벤션 (03-frontend.md). 앱 전역에서 이 함수들만으로 키를 생성해 오타를 방지한다. */
export const queryKeys = {
  riderProfile: (userId: string) => ["riderProfile", userId] as const,
  openCalls: () => ["orders", "openCalls"] as const,
  callDetail: (orderId: string) => ["orders", "detail", orderId] as const,
  activeRun: (riderId: string) => ["orders", "activeRun", riderId] as const,
  todayStats: (riderId: string) => ["riderStats", "today", riderId] as const,
  balance: (userId: string) => ["balance", userId] as const,
  ledger: (userId: string) => ["ledger", userId] as const,
  bankAccount: (userId: string) => ["bankAccount", userId] as const,
  notifications: (userId: string) => ["notifications", userId] as const,
};
