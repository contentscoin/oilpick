import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@oilpick/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileEditPage } from "./ProfileEditPage";

const { mockUseSession, mockFrom, mockUpdate } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockFrom: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

const CURRENT = {
  displayName: "김사장",
  storeName: "행복식당",
  bizNumber: "123-45-67890",
  address: "서울시 강서구 오일픽로 1",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 페이지가 useToast를 쓰므로 실제 앱(App.tsx)과 동일하게 ToastProvider로 감싼다(E6) —
  // 라우트 밖에 두어 /my 이동 후에도 토스트가 남아 있는 실제 동작을 재현한다.
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/my/edit"]}>
          <Routes>
            <Route path="/my/edit" element={<ProfileEditPage />} />
            <Route path="/my" element={<div data-testid="my-page">MY_PAGE</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("ProfileEditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    mockUpdate.mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    // 로드(select→eq→maybeSingle)는 테이블별 현재 값을, 저장(update→eq)은 성공을 반환한다.
    mockFrom.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === "profiles"
                  ? { id: "user-1", display_name: CURRENT.displayName }
                  : {
                      store_name: CURRENT.storeName,
                      biz_number: CURRENT.bizNumber,
                      address: CURRENT.address,
                    },
              error: null,
            }),
        }),
      }),
      update: mockUpdate,
    }));
  });

  it("prefills the form with the existing profile (E4)", async () => {
    renderPage();
    // 입력 요소는 프로필 로드 전에 빈 값으로 먼저 렌더되므로, 요소 존재가 아니라
    // 비동기 로드가 값을 채울 때까지 기다려서 검증해야 한다.
    await waitFor(() =>
      expect(screen.getByTestId("edit-display-name-input")).toHaveValue(CURRENT.displayName),
    );
    expect(screen.getByTestId("edit-store-name-input")).toHaveValue(CURRENT.storeName);
    expect(screen.getByTestId("address-input")).toHaveValue(CURRENT.address);
  });

  it("renders the biz number as read-only (E4)", async () => {
    renderPage();
    const biz = await screen.findByTestId("edit-biz-number-readonly");
    expect(biz).toHaveTextContent(CURRENT.bizNumber);
    expect(biz).toHaveTextContent("변경 불가");
    // div이므로 편집 불가 — 사업자번호를 담은 편집 가능한 입력이 없다.
    expect(biz.tagName).toBe("DIV");
    expect(screen.queryByDisplayValue(CURRENT.bizNumber)).toBeNull();
  });

  it("shows a zod validation error and does not save when a required field is empty (E4)", async () => {
    renderPage();
    const nameInput = await screen.findByTestId("edit-display-name-input");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.submit(nameInput.closest("form")!);

    expect(await screen.findByTestId("profile-edit-error")).toHaveTextContent("입력값을 확인해주세요.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls update and navigates to /my on a valid save (E4)", async () => {
    renderPage();
    const nameInput = await screen.findByTestId("edit-display-name-input");
    fireEvent.change(nameInput, { target: { value: "새담당자" } });
    fireEvent.submit(nameInput.closest("form")!);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ display_name: "새담당자" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ store_name: CURRENT.storeName, address: CURRENT.address }),
    );
    expect(await screen.findByTestId("my-page")).toBeInTheDocument();
    // E6: 저장 성공 토스트 — /my 이동 후에도 표시된다.
    expect(screen.getByTestId("toast")).toHaveTextContent("프로필을 저장했어요");
  });

  it("shows an error toast and stays on the page when the save fails (E6)", async () => {
    mockUpdate.mockReturnValue({ eq: () => Promise.resolve({ error: { message: "저장에 실패했어요" } }) });
    renderPage();
    const nameInput = await screen.findByTestId("edit-display-name-input");
    fireEvent.change(nameInput, { target: { value: "새담당자" } });
    fireEvent.submit(nameInput.closest("form")!);

    expect(await screen.findByTestId("toast")).toHaveTextContent("저장에 실패했어요");
    expect(screen.queryByTestId("my-page")).not.toBeInTheDocument();
  });
});
