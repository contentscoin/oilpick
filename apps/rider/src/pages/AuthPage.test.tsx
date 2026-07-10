import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./AuthPage";

/**
 * 07 F11 라이더 가입 서류(DOCS 단계) 검증:
 * - 신고증명서 업로드 항목이 "폐기물처리(수집·운반) 신고증명서 (필수)"로 표시 + 안내 카피
 *   (정부24 '폐기물처리(수집·운반) 신고' — 처리 약 14일, 신고증명서 없이는 승인 불가)
 * - 인계처(recycler_name/contact) 입력 필드 존재(필수)
 * - 인계처 누락 제출 → 클라이언트 검증 에러(insert 없음)
 * - 신고증명서 누락 제출 → "모두 필수" 에러(insert 없음)
 */

const { mockAuth, mockFrom } = vi.hoisted(() => ({
  mockAuth: {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getUser: vi.fn(),
  },
  mockFrom: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  supabase: { auth: mockAuth, from: mockFrom, storage: { from: vi.fn() } },
}));

/** PHONE → CODE → DOCS 단계까지 진행(신규 가입자: rider_profiles 행 없음). */
async function renderDocsStep() {
  render(
    <MemoryRouter>
      <AuthPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByTestId("phone-input"), { target: { value: "010-1234-5678" } });
  fireEvent.click(screen.getByTestId("send-otp-button"));
  await screen.findByTestId("code-input");
  fireEvent.change(screen.getByTestId("code-input"), { target: { value: "123456" } });
  fireEvent.click(screen.getByTestId("verify-otp-button"));
  await screen.findByTestId("display-name-input");
}

describe("AuthPage DOCS 단계 (07 F11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });
    mockAuth.verifyOtp.mockResolvedValue({ data: { user: { id: "uid-1" } }, error: null });
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "uid-1" } }, error: null });
    // 신규 가입자: rider_profiles 조회 결과 없음 → DOCS 단계 진입.
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("신고증명서 항목을 필수로 표시하고 정부24 안내 카피를 렌더한다", async () => {
    await renderDocsStep();
    expect(screen.getByTestId("permit-doc-label")).toHaveTextContent(
      "폐기물처리(수집·운반) 신고증명서 (필수)",
    );
    expect(screen.getByText(/정부24 ‘폐기물처리\(수집·운반\) 신고’/)).toBeInTheDocument();
    expect(screen.getByText(/처리 약 14일/)).toBeInTheDocument();
    expect(screen.getByText(/신고증명서 없이는 승인이 불가해요/)).toBeInTheDocument();
  });

  it("인계처(재활용업체) 업체명·연락처 입력 필드를 렌더한다", async () => {
    await renderDocsStep();
    expect(screen.getByTestId("recycler-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("recycler-contact-input")).toBeInTheDocument();
    expect(screen.getByText(/수거한 기름을 인계·매각할 허가 재활용업체/)).toBeInTheDocument();
  });

  it("사업자번호는 숫자 키패드, 인계처 연락처는 전화 키패드를 띄운다(inputMode)", async () => {
    await renderDocsStep();
    expect(screen.getByTestId("biz-number-input")).toHaveAttribute("inputmode", "numeric");
    const contact = screen.getByTestId("recycler-contact-input");
    expect(contact).toHaveAttribute("type", "tel");
    expect(contact).toHaveAttribute("inputmode", "tel");
    // 차량번호는 한글 포함 텍스트 입력 유지.
    expect(screen.getByTestId("vehicle-number-input")).not.toHaveAttribute("inputmode");
  });

  it("인계처 누락 제출 시 검증 에러를 내고 insert하지 않는다", async () => {
    await renderDocsStep();
    fireEvent.change(screen.getByTestId("display-name-input"), { target: { value: "김라이더" } });
    fireEvent.change(screen.getByTestId("biz-number-input"), { target: { value: "123-45-67890" } });
    fireEvent.change(screen.getByTestId("vehicle-number-input"), { target: { value: "12가 3456" } });

    const form = screen.getByTestId("submit-docs-button").closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "인계처(재활용업체) 업체명과 연락처는 필수예요.",
    );
    await waitFor(() => expect(mockAuth.getUser).not.toHaveBeenCalled());
  });

  it("신고증명서 누락 제출 시 '모두 필수' 에러를 내고 insert하지 않는다", async () => {
    await renderDocsStep();
    fireEvent.change(screen.getByTestId("display-name-input"), { target: { value: "김라이더" } });
    fireEvent.change(screen.getByTestId("biz-number-input"), { target: { value: "123-45-67890" } });
    fireEvent.change(screen.getByTestId("vehicle-number-input"), { target: { value: "12가 3456" } });
    fireEvent.change(screen.getByTestId("recycler-name-input"), { target: { value: "한빛자원" } });
    fireEvent.change(screen.getByTestId("recycler-contact-input"), { target: { value: "02-000-0000" } });

    const form = screen.getByTestId("submit-docs-button").closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "사업자등록증·차량 사진·폐기물처리 신고증명서는 모두 필수예요.",
    );
    await waitFor(() => expect(mockAuth.getUser).not.toHaveBeenCalled());
  });
});
