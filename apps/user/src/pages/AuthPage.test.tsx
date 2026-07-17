import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERRAL_CODE_STORAGE_KEY } from "@oilpick/core";
import { AuthPage } from "./AuthPage";

const {
  mockSignInWithOtp,
  mockVerifyOtp,
  mockGetUser,
  mockFrom,
  mockMaybeSingle,
  mockInsert,
  mockInvokeEdgeFunction,
} = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockInsert: vi.fn(),
  mockInvokeEdgeFunction: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      getUser: mockGetUser,
    },
    from: mockFrom,
  },
}));
// 09 H4 — 가입 직후 best-effort referral-attach 경로 검증용.
vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvokeEdgeFunction }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<div>HOME_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** OTP→코드→프로필 폼 제출까지 신규 가입 플로우를 완주시키는 헬퍼(referral attach 테스트 공용). */
async function completeSignupFlow() {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  renderPage();

  fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
  fireEvent.click(screen.getByTestId("send-otp-button"));
  await screen.findByTestId("code-input");
  fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
  fireEvent.click(screen.getByTestId("verify-otp-button"));
  await screen.findByTestId("display-name-input");

  fireEvent.change(screen.getByTestId("display-name-input"), { target: { value: "김사장" } });
  fireEvent.change(screen.getByTestId("store-name-input"), { target: { value: "행복식당" } });
  fireEvent.change(screen.getByTestId("biz-number-input"), { target: { value: "123-45-67890" } });
  fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구" } });
  fireEvent.click(screen.getByTestId("create-profile-button"));
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // profiles.select(...).eq(...).maybeSingle() 체인 — 기본은 "신규 가입자"(row 없음).
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      insert: mockInsert,
    }));
    mockInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockInvokeEdgeFunction.mockResolvedValue({ ok: true, data: { status: "SIGNED_UP", supplierBonus: 5000 } });
  });

  it("rejects an invalid phone number before calling signInWithOtp", () => {
    renderPage();
    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "123" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));
    expect(screen.getByTestId("auth-error")).toHaveTextContent("올바른 휴대폰 번호를 입력해주세요.");
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it("sends OTP with E.164-formatted phone and advances to the code step", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: "821012345678" }));
    expect(await screen.findByTestId("code-input")).toBeInTheDocument();
  });

  it("shows the profile step for a new user after successful OTP verification", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    renderPage();

    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));
    await screen.findByTestId("code-input");

    fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp-button"));

    expect(await screen.findByTestId("display-name-input")).toBeInTheDocument();
  });

  it("uses a numeric keypad for the business-number input (inputMode)", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    renderPage();

    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));
    await screen.findByTestId("code-input");
    fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp-button"));
    await screen.findByTestId("display-name-input");

    expect(screen.getByTestId("biz-number-input")).toHaveAttribute("inputmode", "numeric");
  });

  it("navigates straight to home when the user already has a profile", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: "user-1" }, error: null });
    renderPage();

    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));
    await screen.findByTestId("code-input");

    fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp-button"));

    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
  });

  it("creates profiles + supplier_profiles rows and navigates home on submit", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    renderPage();

    fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
    fireEvent.click(screen.getByTestId("send-otp-button"));
    await screen.findByTestId("code-input");
    fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("verify-otp-button"));
    await screen.findByTestId("display-name-input");

    fireEvent.change(screen.getByTestId("display-name-input"), { target: { value: "김사장" } });
    fireEvent.change(screen.getByTestId("store-name-input"), { target: { value: "행복식당" } });
    fireEvent.change(screen.getByTestId("biz-number-input"), { target: { value: "123-45-67890" } });
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구" } });

    fireEvent.click(screen.getByTestId("create-profile-button"));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(2));
    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "user-1", role: "supplier", display_name: "김사장" }),
    );
    expect(mockInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "user-1",
        store_name: "행복식당",
        biz_number: "123-45-67890",
        address: "서울시 강서구",
      }),
    );
    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
  });

  // ===== 09 H4 — 가입 직후 추천코드 attach(best-effort·비차단) =====

  it("저장된 유효 추천코드로 referral-attach를 호출하고 키를 소비한다", async () => {
    localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, "ABCD2345");
    await completeSignupFlow();

    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
    expect(mockInvokeEdgeFunction).toHaveBeenCalledWith("referral-attach", { code: "ABCD2345" });
    // 성패와 무관하게 코드를 소비해 재시도·중복 attach를 막는다.
    expect(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)).toBeNull();
  });

  it("저장된 코드가 형식 위반이면 attach를 건너뛰되 키는 소비한다", async () => {
    localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, "BAD"); // 8자 미달
    await completeSignupFlow();

    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
    expect(mockInvokeEdgeFunction).not.toHaveBeenCalled();
    expect(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)).toBeNull();
  });

  it("attach가 실패(예외)해도 가입은 성립하고 홈으로 이동한다(비차단)", async () => {
    localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, "ABCD2345");
    mockInvokeEdgeFunction.mockRejectedValue(new Error("network down"));
    await completeSignupFlow();

    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
    expect(localStorage.getItem(REFERRAL_CODE_STORAGE_KEY)).toBeNull();
  });

  it("저장된 코드가 없으면 attach를 호출하지 않는다", async () => {
    await completeSignupFlow();
    expect(await screen.findByText("HOME_PAGE")).toBeInTheDocument();
    expect(mockInvokeEdgeFunction).not.toHaveBeenCalled();
  });
});
