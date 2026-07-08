import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { BigButton, ErrorScreen, OfflineBanner } from "@oilpick/ui";
import { AuthGuard } from "./components/AuthGuard";
import { UserShell } from "./components/UserShell";
import { useNativeIntegration } from "./hooks/useNativeIntegration";
import { queryClient } from "./lib/queryClient";
import { ONBOARDING_DONE_KEY } from "./pages/onboardingKey";
import { RouteFallback } from "./components/RouteFallback";

/**
 * 라우트 페이지는 React.lazy로 분리해 첫 페인트에 필요없는 코드(특히 U4 시세 화면의 recharts)를
 * 초기 index 청크에서 뺀다. AuthGuard/UserShell/RouteFallback 등 셸/가드는 첫 진입에 반드시
 * 필요하므로 eager import를 유지한다. 동작/데이터흐름은 그대로다(순수 로딩 최적화).
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
const ProfileEditPage = lazy(() =>
  import("./pages/ProfileEditPage").then((m) => ({ default: m.ProfileEditPage })),
);
const DevUiPage = lazy(() => import("./pages/DevUiPage").then((m) => ({ default: m.DevUiPage })));

/**
 * 06-enhancement-plan.md E1: 하단 탭이 필요한 화면(홈/이력/포인트/알림/마이)을 한 레이아웃 라우트로
 * 묶어 `UserShell`(탭바)을 일괄 적용한다. 이전에는 홈에 탭바가 없어 다른 섹션으로 이동하지 못했다.
 * 온보딩 게이트(첫 실행)와 AuthGuard(미인증 → /auth)는 셸 진입 전에 통과해야 한다.
 * 플로우 화면(/request, /orders/:id, /wallet/withdraw, /my/edit)은 탭 없이 풀스크린으로 유지한다.
 */
function AppShell() {
  const onboardingDone = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  if (!onboardingDone) return <Navigate to="/onboarding" replace />;
  return (
    <AuthGuard>
      <UserShell>
        <Outlet />
      </UserShell>
    </AuthGuard>
  );
}

/** 06-enhancement-plan.md E2: 캐치올(존재하지 않는 경로) — 막다른 길 대신 홈 복귀 경로 제공. */
function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <main style={{ padding: 20, maxWidth: 480, margin: "0 auto", minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ErrorScreen
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 삭제된 화면일 수 있어요."
        action={
          <BigButton data-testid="notfound-home-button" onClick={() => navigate("/", { replace: true })}>
            홈으로
          </BigButton>
        }
      />
    </main>
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

          {/* 탭바가 있는 앱 셸(홈/이력/포인트/알림/마이) */}
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/orders" element={<OrdersHistoryPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/my" element={<MyPage />} />
          </Route>

          {/* 풀스크린 플로우(탭 없음) — AuthGuard는 개별 적용 */}
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
            path="/orders/:id"
            element={
              <AuthGuard>
                <OrderDetailPage />
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
            path="/my/edit"
            element={
              <AuthGuard>
                <ProfileEditPage />
              </AuthGuard>
            }
          />

          <Route path="/dev-ui" element={<DevUiPage />} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
