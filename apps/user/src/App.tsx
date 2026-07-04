import { Route, Routes } from "react-router-dom";
import { DevUiPage } from "./pages/DevUiPage";

function Home() {
  return (
    <main>
      <h1>OilPick User App</h1>
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
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dev-ui" element={<DevUiPage />} />
    </Routes>
  );
}
