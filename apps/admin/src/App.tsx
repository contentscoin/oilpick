import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { AdminShell } from "./components/AdminShell";
import { RouteFallback } from "./components/RouteFallback";
import { useCurrentRole } from "./hooks/useCurrentRole";
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
// [07 F13] DepotsPage 일몰 — 집하장/QR 배송(구모델) 소멸(07 §0). 라우트·네비 제거,
// 파일·테이블·QR 시크릿은 레거시 보존(신모델은 depot 미사용). 신규 등록도 DepotsPage 내부에서 차단.
const NotifyPage = lazy(() =>
  import("./pages/NotifyPage").then((m) => ({ default: m.NotifyPage })),
);
const CsPage = lazy(() => import("./pages/CsPage").then((m) => ({ default: m.CsPage })));
const ReferralsPage = lazy(() =>
  import("./pages/ReferralsPage").then((m) => ({ default: m.ReferralsPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
// 13 I3·I4 좌상(dealer) 화면.
const DealersPage = lazy(() => import("./pages/DealersPage").then((m) => ({ default: m.DealersPage })));
const DealerHomePage = lazy(() =>
  import("./pages/DealerHomePage").then((m) => ({ default: m.DealerHomePage })),
);
const DealerPerformancePage = lazy(() =>
  import("./pages/DealerPerformancePage").then((m) => ({ default: m.DealerPerformancePage })),
);

/**
 * 03-frontend.md apps/admin 라우팅 + 13 I3. /login만 가드 밖. 나머지는 AuthGuard(admin|dealer
 * 진입) + AdminShell + RoleGate(라우트별 허용 role)로 감싼다. 기본 허용 role은 admin.
 */
function RoleGate({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { role, loading } = useCurrentRole();
  if (loading) return null;
  if (role && !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Protected({ children, roles = ["admin"] }: { children: React.ReactNode; roles?: string[] }) {
  return (
    <AuthGuard>
      <AdminShell>
        <RoleGate roles={roles}>{children}</RoleGate>
      </AdminShell>
    </AuthGuard>
  );
}

/** "/" — role별 홈: admin=대시보드, dealer=관할 대시보드. */
function HomeRoute() {
  const { role } = useCurrentRole();
  return role === "dealer" ? <DealerHomePage /> : <DashboardPage />;
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
              <Protected roles={["admin", "dealer"]}>
                <HomeRoute />
              </Protected>
            }
          />
          <Route
            path="/dealers"
            element={
              <Protected>
                <DealersPage />
              </Protected>
            }
          />
          <Route
            path="/performance"
            element={
              <Protected roles={["dealer"]}>
                <DealerPerformancePage />
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
            path="/cs"
            element={
              <Protected>
                <CsPage />
              </Protected>
            }
          />
          <Route
            path="/referrals"
            element={
              <Protected>
                <ReferralsPage />
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
          {/* 미지정 URL이 빈 화면이 되지 않게 catch-all — 셸 안에서 안내 + 대시보드 복귀 링크. */}
          <Route
            path="*"
            element={
              <Protected roles={["admin", "dealer"]}>
                <NotFoundPage />
              </Protected>
            }
          />
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
