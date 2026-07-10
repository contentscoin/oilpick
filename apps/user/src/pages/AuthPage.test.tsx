import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

const {
  mockSignInWithOtp,
  mockVerifyOtp,
  mockGetUser,
  mockFrom,
  mockMaybeSingle,
  mockInsert,
} = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockInsert: vi.fn(),
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

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // profiles.select(...).eq(...).maybeSingle() 체인 — 기본은 "신규 가입자"(row 없음).
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockFrom.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      insert: mockInsert,
    }));
    mockInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
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
});
