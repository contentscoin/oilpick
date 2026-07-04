import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { useNativeIntegration } from "./hooks/useNativeIntegration";
import { queryClient } from "./lib/queryClient";
import { DevUiPage } from "./pages/DevUiPage";
import { OnboardingPage, ONBOARDING_DONE_KEY } from "./pages/OnboardingPage";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { PricePage } from "./pages/PricePage";
import { RequestPage } from "./pages/RequestPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersHistoryPage } from "./pages/OrdersHistoryPage";
import { WalletPage } from "./pages/WalletPage";
import { WithdrawPage } from "./pages/WithdrawPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { MyPage } from "./pages/MyPage";

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
    </QueryClientProvider>
  );
}
