import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadgePage } from "./BadgePage";

const { mockUseSession, mockUseRiderProfile, mockToDataURL } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseRiderProfile: vi.fn(),
  mockToDataURL: vi.fn(),
}));
vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useRiderProfile", () => ({ useRiderProfile: mockUseRiderProfile }));
vi.mock("qrcode", () => ({ default: { toDataURL: mockToDataURL } }));

const approvedProfile = {
  id: "rider-1",
  displayName: "김수거",
  vehicleNumber: "서울12가3456",
  verifyStatus: "APPROVED",
  rejectReason: null,
  isOnline: true,
};

describe("BadgePage — 명함형 인증 카드(06 E12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
    mockUseRiderProfile.mockReturnValue({ data: approvedProfile, isLoading: false });
    mockToDataURL.mockResolvedValue("data:image/png;base64,QR");
  });

  it("그린 히어로 배경 위에 이름·차량번호·인증 문구를 렌더한다", async () => {
    render(<BadgePage />);

    expect(screen.getByTestId("badge-hero")).toBeInTheDocument();
    expect(screen.getByTestId("badge-name")).toHaveTextContent("김수거");
    expect(screen.getByTestId("badge-vehicle-number")).toHaveTextContent("서울12가3456");
    expect(screen.getByText("인증된 라이더")).toBeInTheDocument();
    expect(screen.getByTestId("badge-photo-placeholder")).toBeInTheDocument();
    // QR 생성(setState)이 테스트 종료 후 resolve되며 act 경고가 나지 않도록 완료까지 대기.
    await screen.findByTestId("badge-qr-image");
  });

  it("미승인(PENDING) 라이더에게는 인증 문구를 보여주지 않는다", async () => {
    mockUseRiderProfile.mockReturnValue({
      data: { ...approvedProfile, verifyStatus: "PENDING" },
      isLoading: false,
    });
    render(<BadgePage />);
    expect(screen.queryByText("인증된 라이더")).not.toBeInTheDocument();
    await screen.findByTestId("badge-qr-image");
  });

  it("흰 QR 카드 안에 rider_id 기반 QR 이미지를 렌더한다", async () => {
    render(<BadgePage />);

    expect(screen.getByTestId("badge-qr-card")).toBeInTheDocument();
    expect(await screen.findByTestId("badge-qr-image")).toHaveAttribute(
      "src",
      "data:image/png;base64,QR",
    );
    expect(mockToDataURL).toHaveBeenCalledWith(
      JSON.stringify({ riderId: "rider-1" }),
      expect.objectContaining({ width: 240 }),
    );
  });
});
