import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { RiderShell } from "./components/RiderShell";
import { useNativeIntegration } from "./hooks/useNativeIntegration";
import { queryClient } from "./lib/queryClient";
import { AuthPage } from "./pages/AuthPage";
import { VerifyPage } from "./pages/VerifyPage";
import { CallHomePage } from "./pages/CallHomePage";
import { CallDetailPage } from "./pages/CallDetailPage";
import { ActiveRunPage } from "./pages/ActiveRunPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { EarningsPage } from "./pages/EarningsPage";
import { EarningsWithdrawPage } from "./pages/EarningsWithdrawPage";
import { BadgePage } from "./pages/BadgePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { MyPage } from "./pages/MyPage";

/**
 * apps/rider 라우팅. docs/spec/03-frontend.md "apps/rider" 표(R1~R12) 그대로.
 * R1(/auth, /verify), R2(/), R3(/calls/:id), R4~R6(/active)는 T9 구현.
 * R7/R8(/earnings, /earnings/withdraw), R9(/badge), R11/R12(/notifications, /my)는 이번
 * 태스크(T10) 구현. R10(/history)만 아직 범위 밖이라 placeholder를 유지한다.
 */
export function App() {
  // 네이티브(Capacitor) 통합: 커스텀 스킴 딥링크 + FCM 푸시 초기화(웹에서는 no-op).
  useNativeIntegration();

  return (
    <QueryClientProvider client={queryClient}>
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
          path="/earnings/withdraw"
          element={
            <AuthGuard>
              <EarningsWithdrawPage />
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
          path="/history"
          element={
            <AuthGuard>
              <PlaceholderPage title="이력 (준비 중)" />
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
    </QueryClientProvider>
  );
}
