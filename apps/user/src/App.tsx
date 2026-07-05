import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { OfflineBanner } from "@oilpick/ui";
import { AuthGuard } from "./components/AuthGuard";
import { useNativeIntegration } from "./hooks/useNativeIntegration";
import { queryClient } from "./lib/queryClient";
import { ONBOARDING_DONE_KEY } from "./pages/onboardingKey";
import { RouteFallback } from "./components/RouteFallback";

/**
 * 라우트 페이지는 React.lazy로 분리해 첫 페인트에 필요없는 코드(특히 U4 시세 화면의 recharts)를
 * 초기 index 청크에서 뺀다. AuthGuard/RouteFallback 등 셸/가드는 첫 진입에 반드시 필요하므로
 * eager import를 유지한다. 동작/데이터흐름은 그대로다(순수 로딩 최적화).
 */
const OnboardingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const AuthPage = lazy(() => import("./pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const PricePage = lazy(() => import("./pages/PricePage").then((m) => ({ default: m.PricePage })));
const RequestPage = lazy(() =>
  import("./pages/RequestPage").then((m) => ({ default: m.RequestPage })),
);
const OrderDetailPage = lazy(() =>
  import("./pages/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })),
);
const OrdersHistoryPage = lazy(() =>
  import("./pages/OrdersHistoryPage").then((m) => ({ default: m.OrdersHistoryPage })),
);
const WalletPage = lazy(() => import("./pages/WalletPage").then((m) => ({ default: m.WalletPage })));
const WithdrawPage = lazy(() =>
  import("./pages/WithdrawPage").then((m) => ({ default: m.WithdrawPage })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const MyPage = lazy(() => import("./pages/MyPage").then((m) => ({ default: m.MyPage })));
const DevUiPage = lazy(() => import("./pages/DevUiPage").then((m) => ({ default: m.DevUiPage })));

/**
 * 루트("/") 진입 가드. U1 온보딩을 아직 안 봤으면 /onboarding으로,
 * 03-frontend.md T7 작업 지시대로 인증 안 된 사용자는 /auth로 리다이렉트한다.
 */
function RootRoute() {
  const onboardingDone = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  if (!onboardingDone) return <Navigate to="/onboarding" replace />;
  return (
    <AuthGuard>
      <HomePage />
    </AuthGuard>
  );
}

/**
 * `/dev-ui`는 packages/ui 컴포넌트를 한 화면에서 육안 확인하기 위한 개발 전용 라우트다
 * (04-tasks.md T6 DoD). 프로덕션 노출 우려가 없는 이유: 별도 인증/데이터 연동 없이 정적 목업
 * props만 렌더하고, 실제 라우트 스펙(03-frontend.md)에 없는 경로라 프로덕션 내비게이션에서
 * 링크되지 않는다. 필요 시 이후 태스크에서 `import.meta.env.DEV` 가드를 추가할 수 있다.
 */
export function App() {
  // 네이티브(Capacitor) 통합: 커스텀 스킴 딥링크 + FCM 푸시 초기화(웹에서는 no-op).
  useNativeIntegration();

  return (
    <QueryClientProvider client={queryClient}>
      {/* 03-frontend.md "공통 규칙" 오프라인 배너 — 셸 래핑과 무관하게 항상 최상단에 고정. */}
      <OfflineBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<RootRoute />} />
          <Route
            path="/price"
            element={
              <AuthGuard>
                <PricePage />
              </AuthGuard>
            }
          />
          <Route
            path="/request"
            element={
              <AuthGuard>
                <RequestPage />
              </AuthGuard>
            }
          />
          <Route
            path="/orders"
            element={
              <AuthGuard>
                <OrdersHistoryPage />
              </AuthGuard>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <AuthGuard>
                <OrderDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/wallet"
            element={
              <AuthGuard>
                <WalletPage />
              </AuthGuard>
            }
          />
          <Route
            path="/wallet/withdraw"
            element={
              <AuthGuard>
                <WithdrawPage />
              </AuthGuard>
            }
          />
          <Route
            path="/notifications"
            element={
              <AuthGuard>
                <NotificationsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/my"
            element={
              <AuthGuard>
                <MyPage />
              </AuthGuard>
            }
          />
          <Route path="/dev-ui" element={<DevUiPage />} />
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
