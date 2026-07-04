import { Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { AdminShell } from "./components/AdminShell";
import { queryClient } from "./lib/queryClient";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PricePage } from "./pages/PricePage";
import { OrdersPage } from "./pages/OrdersPage";
import { UsersPage } from "./pages/UsersPage";
import { SettlementPage } from "./pages/SettlementPage";
import { DepotsPage } from "./pages/DepotsPage";
import { NotifyPage } from "./pages/NotifyPage";

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
    </QueryClientProvider>
  );
}
