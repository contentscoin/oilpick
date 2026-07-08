import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
// DevUiPage는 packages/ui 전 컴포넌트를 임포트하는 가장 큰 lazy 청크라, 부하 시 테스트 중
// 동적 import의 vite 변환이 findBy 타임아웃(10s)을 넘겨 플레이크가 난다. collect 단계에서
// 변환을 끝내도록 미리 임포트해 dev-ui 라우트 테스트를 결정적으로 만든다.
import "./pages/DevUiPage";

const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock("./lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

// E1/E2 라우팅(셸/탭바/캐치올) 자체를 검증하는 테스트라, 탭 셸 안쪽·플로우 leaf 페이지는
// 데이터/Realtime 의존을 걷어내고 가벼운 스텁으로 대체한다. AppShell/AuthGuard/UserShell/TabBar/
// NotFoundRoute는 eager라 그대로(실제 구현) 렌더된다. 기존 테스트가 쓰는 Onboarding/Auth/DevUi는
// 모킹하지 않는다.
vi.mock("./pages/HomePage", () => ({ HomePage: () => <div data-testid="home-page">HOME</div> }));
vi.mock("./pages/OrdersHistoryPage", () => ({
  OrdersHistoryPage: () => <div data-testid="orders-page">ORDERS</div>,
}));
vi.mock("./pages/WalletPage", () => ({ WalletPage: () => <div data-testid="wallet-page">WALLET</div> }));
vi.mock("./pages/MyPage", () => ({ MyPage: () => <div data-testid="my-page">MY</div> }));
vi.mock("./pages/RequestPage", () => ({ RequestPage: () => <div data-testid="request-page">REQUEST</div> }));

const AUTHED_SESSION = { data: { session: { user: { id: "user-1" } } } };
// lazy chunk 로드가 이 머신에서 부하 시 느려 플레이크가 있어 타임아웃을 넉넉히 준다.
const WAIT = { timeout: 10000 };

function authenticate() {
  localStorage.setItem("oilpick:onboarding-done", "1");
  mockGetSession.mockResolvedValue(AUTHED_SESSION);
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("redirects to /onboarding when onboarding flag is not set", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("onboarding-slide-0")).toBeInTheDocument();
  });

  it("redirects to /auth when onboarding is done but not authenticated", async () => {
    localStorage.setItem("oilpick:onboarding-done", "1");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("phone-input")).toBeInTheDocument();
  });

  it("renders the dev-ui page at /dev-ui without auth", async () => {
    render(
      <MemoryRouter initialEntries={["/dev-ui"]}>
        <App />
      </MemoryRouter>,
    );
    // DevUiPage는 미리보기 전용이라 lazy 청크가 가장 커서, 부하 시 기본 1s 타임아웃으로는 플레이크가 난다.
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "packages/ui 컴포넌트 미리보기" },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
  });

  it("renders the onboarding page at /onboarding directly", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("onboarding-slide-0")).toBeInTheDocument();
  });

  // ===== 06-enhancement-plan.md E1: 홈 탭바 통합(AppShell/UserShell) =====

  it("renders the tab bar on the home and tab-target routes when authenticated (E1)", async () => {
    authenticate();
    const cases = [
      ["/", "home-page"],
      ["/orders", "orders-page"],
      ["/wallet", "wallet-page"],
      ["/my", "my-page"],
    ] as const;
    for (const [route, testId] of cases) {
      const view = render(
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>,
      );
      expect(await screen.findByTestId(testId, undefined, WAIT)).toBeInTheDocument();
      expect(screen.getByTestId("tab-bar")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("renders flow screens full-screen without the tab bar (E1)", async () => {
    authenticate();
    render(
      <MemoryRouter initialEntries={["/request"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("request-page", undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByTestId("tab-bar")).not.toBeInTheDocument();
  });

  // ===== 06-enhancement-plan.md E2: ErrorScreen 캐치올(404) =====

  it("renders the 404 ErrorScreen with a '홈으로' action on unknown routes (E2)", async () => {
    render(
      <MemoryRouter initialEntries={["/no-such-route"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("error-screen", undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByText("페이지를 찾을 수 없어요")).toBeInTheDocument();
    expect(screen.getByTestId("notfound-home-button")).toHaveTextContent("홈으로");
  });

  it("navigates back to the home tab when the 404 '홈으로' action is clicked (E2)", async () => {
    authenticate();
    render(
      <MemoryRouter initialEntries={["/no-such-route"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId("notfound-home-button", undefined, WAIT));
    expect(await screen.findByTestId("home-page", undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByTestId("tab-bar")).toBeInTheDocument();
  });
});
