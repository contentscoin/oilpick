import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./components/AuthGuard";
import { RiderShell } from "./components/RiderShell";
import { queryClient } from "./lib/queryClient";
import { AuthPage } from "./pages/AuthPage";
import { VerifyPage } from "./pages/VerifyPage";
import { CallHomePage } from "./pages/CallHomePage";
import { CallDetailPage } from "./pages/CallDetailPage";
import { ActiveRunPage } from "./pages/ActiveRunPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

/**
 * apps/rider 라우팅. docs/spec/03-frontend.md "apps/rider" 표(R1~R12) 그대로.
 * R1(/auth, /verify), R2(/), R3(/calls/:id), R4~R6(/active)는 이번 태스크(T9) 실제 구현.
 * R7~R9(/earnings, /badge), R10~R12(/history, /my, /notifications)는 T10 범위 —
 * 태스크 지시사항대로 하단 탭 자리만 만들고 "준비 중" placeholder를 둔다.
 */
export function App() {
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
                <PlaceholderPage title="정산 (준비 중)" />
              </RiderShell>
            </AuthGuard>
          }
        />
        <Route
          path="/badge"
          element={
            <AuthGuard>
              <PlaceholderPage title="인증 카드 (준비 중)" />
            </AuthGuard>
          }
        />
        <Route
          path="/my"
          element={
            <AuthGuard>
              <RiderShell>
                <PlaceholderPage title="마이 (준비 중)" />
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
              <PlaceholderPage title="알림 (준비 중)" />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
