import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { AdminShell } from "./components/AdminShell";
import { RouteFallback } from "./components/RouteFallback";
import { queryClient } from "./lib/queryClient";

/**
 * 라우트 페이지는 React.lazy로 분리해 첫 페인트에 필요없는 코드(특히 대시보드/시세 화면의 recharts)를
 * 초기 index 청크에서 뺀다. AuthGuard/AdminShell/RouteFallback 등 셸/가드는 eager import 유지.
 * 동작/데이터흐름은 그대로다(순수 로딩 최적화).
 */
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const PricePage = lazy(() => import("./pages/PricePage").then((m) => ({ default: m.PricePage })));
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })),
);
const UsersPage = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const SettlementPage = lazy(() =>
  import("./pages/SettlementPage").then((m) => ({ default: m.SettlementPage })),
);
const DepotsPage = lazy(() =>
  import("./pages/DepotsPage").then((m) => ({ default: m.DepotsPage })),
);
const NotifyPage = lazy(() =>
  import("./pages/NotifyPage").then((m) => ({ default: m.NotifyPage })),
);

/**
 * 03-frontend.md apps/admin 라우팅. "admin 로그인: 이메일/비밀번호. role≠admin이면 접근 차단"
 * (AuthGuard가 profiles.role을 검증). /login만 가드 밖, 나머지 전부 AuthGuard + AdminShell로 감싼다.
 */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/price"
            element={
              <Protected>
                <PricePage />
              </Protected>
            }
          />
          <Route
            path="/orders"
            element={
              <Protected>
                <OrdersPage />
              </Protected>
            }
          />
          <Route
            path="/users"
            element={
              <Protected>
                <UsersPage />
              </Protected>
            }
          />
          <Route
            path="/settlement"
            element={
              <Protected>
                <SettlementPage />
              </Protected>
            }
          />
          <Route
            path="/depots"
            element={
              <Protected>
                <DepotsPage />
              </Protected>
            }
          />
          <Route
            path="/notify"
            element={
              <Protected>
                <NotifyPage />
              </Protected>
            }
          />
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
