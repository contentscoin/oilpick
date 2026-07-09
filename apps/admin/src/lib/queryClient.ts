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
  couponPriceHistory: (limit: number) => ["admin", "price", "coupon", "history", limit] as const,
  orders: (statusFilter: string) => ["admin", "orders", statusFilter] as const,
  orderDetail: (orderId: string) => ["admin", "orders", "detail", orderId] as const,
  orderEvents: (orderId: string) => ["admin", "orders", "events", orderId] as const,
  suppliers: () => ["admin", "users", "suppliers"] as const,
  riders: (statusFilter: string) => ["admin", "users", "riders", statusFilter] as const,
  couponBalances: () => ["admin", "users", "couponBalances"] as const,
  riderCouponLedger: (riderId: string) => ["admin", "users", "couponLedger", riderId] as const,
  // [07 F13] withdrawals/ledgerAudit 키 제거 — 구모델 출금 큐·point_ledger 감사(useSettlementAdmin)
  // 소멸(D1). 매출·정산은 couponSalesDaily/couponLedgerAudit(useSalesAdmin)로 대체됨.
  couponSalesDaily: (days: number) => ["admin", "sales", "couponDaily", days] as const,
  pickupStatsDaily: (days: number) => ["admin", "sales", "pickupDaily", days] as const,
  couponLedgerAudit: (limit: number) => ["admin", "sales", "couponLedger", limit] as const,
  couponPurchases: (statusFilter: string) => ["admin", "sales", "couponPurchases", statusFilter] as const,
  depots: () => ["admin", "depots"] as const,
  csTickets: (statusFilter: string) => ["admin", "cs", statusFilter] as const,
};
