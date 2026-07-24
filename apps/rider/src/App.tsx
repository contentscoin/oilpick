import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { MobileFrame, OfflineBanner, ToastProvider } from "@oilpick/ui";
import { CallAlertListener } from "./components/CallAlertListener";
import { AuthGuard } from "./components/AuthGuard";
import { RiderShell } from "./components/RiderShell";
import { RouteFallback } from "./components/RouteFallback";
import { useNativeIntegration } from "./hooks/useNativeIntegration";
import { queryClient } from "./lib/queryClient";

/**
 * 라우트 페이지는 React.lazy로 분리해 첫 페인트에 필요없는 코드를 초기 index 청크에서 뺀다.
 * AuthGuard/RiderShell/RouteFallback 등 셸/가드는 첫 진입에 필요하므로 eager import 유지.
 * 동작/데이터흐름은 그대로다(순수 로딩 최적화).
 */
const AuthPage = lazy(() => import("./pages/AuthPage").then((m) => ({ default: m.AuthPage })));
const VerifyPage = lazy(() =>
  import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })),
);
const CallHomePage = lazy(() =>
  import("./pages/CallHomePage").then((m) => ({ default: m.CallHomePage })),
);
const CallDetailPage = lazy(() =>
  import("./pages/CallDetailPage").then((m) => ({ default: m.CallDetailPage })),
);
const ActiveRunPage = lazy(() =>
  import("./pages/ActiveRunPage").then((m) => ({ default: m.ActiveRunPage })),
);
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);
const EarningsPage = lazy(() =>
  import("./pages/EarningsPage").then((m) => ({ default: m.EarningsPage })),
);
const BadgePage = lazy(() => import("./pages/BadgePage").then((m) => ({ default: m.BadgePage })));
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);
const MyPage = lazy(() => import("./pages/MyPage").then((m) => ({ default: m.MyPage })));
const ReferralsPage = lazy(() =>
  import("./pages/ReferralsPage").then((m) => ({ default: m.ReferralsPage })),
);
const SupportPage = lazy(() =>
  import("./pages/SupportPage").then((m) => ({ default: m.SupportPage })),
);

/**
 * apps/rider 라우팅. docs/spec/03-frontend.md "apps/rider" 표(R1~R12).
 * R1(/auth, /verify), R2(/), R3(/calls/:id), R4~R6(/active)는 T9 구현.
 * R7(/earnings="수거 실적"), R9(/badge), R11/R12(/notifications, /my)는 T10 구현.
 * 07 F6-⑤: 포인트 출금(/earnings/withdraw) 라우트 제거(구모델 라이더 포인트 폐기).
 * 08 G6-①: 쿠폰 모델 폐기 — /coupons·/coupons/purchase 라우트와 페이지·훅을 전면 삭제.
 * 잔존 딥링크/북마크는 catch-all이 콜 홈으로 되돌린다.
 */
export function App() {
  // 네이티브(Capacitor) 통합: 커스텀 스킴 딥링크 + FCM 푸시 초기화(웹에서는 no-op).
  useNativeIntegration();

  return (
    <QueryClientProvider client={queryClient}>
      {/* 06 E6 — 액션 피드백 토스트 전역 프로바이더. offsetBottom은 하단 탭바를 피한 값. */}
      <ToastProvider offsetBottom={76}>
      {/* [12 §8] 모바일 고정 프레임 — 라이더 전 라우트를 420px 폭으로 감싼다. */}
      <MobileFrame>
      {/* 03-frontend.md "공통 규칙" 오프라인 배너 — 셸 래핑과 무관하게 항상 최상단에 고정. */}
      <OfflineBanner />
      {/* 06 E3 — 콜 도착 포그라운드 알림(배너/사운드/진동) 전역 리스너. */}
      <CallAlertListener />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/verify"
            element={
              <AuthGuard>
                <VerifyPage />
              </AuthGuard>
            }
          />
          <Route
            path="/"
            element={
              <AuthGuard>
                <RiderShell>
                  <CallHomePage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route
            path="/calls/:id"
            element={
              <AuthGuard>
                <CallDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/active"
            element={
              <AuthGuard>
                <RiderShell>
                  <ActiveRunPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route
            path="/earnings"
            element={
              <AuthGuard>
                <RiderShell>
                  <EarningsPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route
            path="/badge"
            element={
              <AuthGuard>
                <BadgePage />
              </AuthGuard>
            }
          />
          <Route
            path="/my"
            element={
              <AuthGuard>
                <RiderShell>
                  <MyPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route
            path="/support"
            element={
              <AuthGuard>
                <SupportPage />
              </AuthGuard>
            }
          />
          <Route
            path="/history"
            element={
              <AuthGuard>
                <RiderShell>
                  <HistoryPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          {/* 09 H4 — 내 추천(코드·공유·실적). 탭바에 없고 마이에서 진입(운행 이력과 동일 패턴). */}
          <Route
            path="/referrals"
            element={
              <AuthGuard>
                <RiderShell>
                  <ReferralsPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route
            path="/notifications"
            element={
              <AuthGuard>
                <RiderShell>
                  <NotificationsPage />
                </RiderShell>
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </MobileFrame>
      </ToastProvider>
    </QueryClientProvider>
  );
}
