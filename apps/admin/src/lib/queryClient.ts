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
      staleTime: 15_000,
      // 03-frontend.md "공통 규칙"(네트워크 재시도): 연결 복구 시 자동 refetch.
      refetchOnReconnect: true,
    },
  },
});

/** queryKey 컨벤션 (03-frontend.md). admin 화면 전역에서 이 함수들만으로 키를 생성한다. */
export const queryKeys = {
  session: () => ["session"] as const,
  dashboardOrders: () => ["admin", "dashboard", "orders"] as const,
  dashboardRiders: () => ["admin", "dashboard", "riders"] as const,
  dashboardKpi: (day: string) => ["admin", "dashboard", "kpi", day] as const,
  priceLatest: () => ["admin", "price", "latest"] as const,
  priceHistory: (limit: number) => ["admin", "price", "history", limit] as const,
  orders: (statusFilter: string) => ["admin", "orders", statusFilter] as const,
  orderDetail: (orderId: string) => ["admin", "orders", "detail", orderId] as const,
  orderEvents: (orderId: string) => ["admin", "orders", "events", orderId] as const,
  suppliers: () => ["admin", "users", "suppliers"] as const,
  riders: (statusFilter: string) => ["admin", "users", "riders", statusFilter] as const,
  // [08 G7] 쿠폰 키(couponPriceHistory/couponBalances/riderCouponLedger/couponSalesDaily/
  // couponLedgerAudit/couponPurchases) 제거 — 쿠폰 모델 폐기(08 P1).
  // 출금 큐·포인트 원장 감사 키 부활(07 F13이 제거했던 축 — 08 P4).
  withdrawals: (statusFilter: string) => ["admin", "settlement", "withdrawals", statusFilter] as const,
  pointLedgerAudit: (limit: number) => ["admin", "settlement", "pointLedger", limit] as const,
  riderPayouts: (days: number) => ["admin", "settlement", "riderPayouts", days] as const,
  pickupStatsDaily: (days: number) => ["admin", "settlement", "pickupDaily", days] as const,
  depots: () => ["admin", "depots"] as const,
  csTickets: (statusFilter: string) => ["admin", "cs", statusFilter] as const,
};
