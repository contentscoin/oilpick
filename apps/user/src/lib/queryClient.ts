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
      // 03-frontend.md "공통 규칙"(네트워크 재시도): 연결이 끊겼다 복구되면 자동 refetch.
      // (TanStack Query v5 기본값이지만 오프라인 배너와 짝을 이루는 동작이라 의도를 명시.)
      refetchOnReconnect: true,
    },
  },
});

/** queryKey 컨벤션 (03-frontend.md). 앱 전역에서 이 함수들만으로 키를 생성해 오타를 방지한다. */
export const queryKeys = {
  profile: (userId: string) => ["profile", userId] as const,
  latestPriceTick: () => ["priceTicks", "latest"] as const,
  priceTickHistory: (limit: number) => ["priceTicks", "history", limit] as const,
  priceTickSince: (days: number) => ["priceTicks", "since", days] as const,
  activeOrder: (userId: string) => ["orders", "active", userId] as const,
  orderDetail: (orderId: string) => ["orders", "detail", orderId] as const,
  riderCard: (riderId: string) => ["riderCard", riderId] as const,
  orderHistory: (userId: string, page: number) => ["orders", "history", userId, page] as const,
  // [08 G5] 포인트 지갑 부활 — v_point_balance / point_ledger(useWallet.ts).
  balance: (userId: string) => ["balance", userId] as const,
  ledger: (userId: string) => ["ledger", userId] as const,
  // [08 P4] 본인 출금 신청 목록(useWithdrawals) — U11 "출금 진행" 섹션.
  withdrawals: (userId: string) => ["withdrawals", userId] as const,
  bankAccount: (userId: string) => ["bankAccount", userId] as const,
  notifications: (userId: string) => ["notifications", userId] as const,
  // [07 F8→08 G5] 수령(확정 지급액) 요약·이력 — payout_method로 현금/포인트 분리.
  monthlyCashReceipt: (userId: string) => ["cashReceipts", "monthly", userId] as const,
  cashReceipts: (userId: string) => ["cashReceipts", "list", userId] as const,
  // [07 F9] 최근 완료 주문 주소 재사용 칩(distinct 최근 2건).
  recentAddresses: (userId: string) => ["recentAddresses", userId] as const,
};
