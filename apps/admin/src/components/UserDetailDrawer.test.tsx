import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserDetailDrawer } from "./UserDetailDrawer";
import type { AdminRiderRow, AdminSupplierRow } from "../hooks/useUsersAdmin";

/**
 * [19 T4] 회원 상세·정보수정 드로어.
 * 고정하는 계약: ① 부분 수정(바뀐 항목만 user-update로 전송) ② 변경 없으면 호출 안 함
 * ③ 재활용업체는 빈 문자열 = 지움(null) ④ 승인상태·소속·한도 입력 필드가 없다(권한 경로 분리)
 * ⑤ 라이더 상세에 소속 좌상·지급 한도가 표시된다(19 §0 누락 연결).
 */
const { mockUpdateUser, mockUseRiderCredits, mockUseUserRecentOrders } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockUseRiderCredits: vi.fn(),
  mockUseUserRecentOrders: vi.fn(),
}));
vi.mock("../hooks/useUsersAdmin", () => ({
  useUserMutations: () => ({ updateUser: mockUpdateUser }),
  useRiderCredits: () => mockUseRiderCredits(),
  useUserRecentOrders: (...args: unknown[]) => mockUseUserRecentOrders(...args),
}));

const SUPPLIER: AdminSupplierRow = {
  id: "sup-1",
  displayName: "김점주",
  storeName: "행복식당",
  bizNumber: "123-45-67890",
  address: "서울 강서구 화곡로 1",
  phone: "01011112222",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const RIDER: AdminRiderRow = {
  id: "rider-1",
  displayName: "김라이더",
  phone: "01033334444",
  bizNumber: "999-88-77777",
  vehicleNumber: "12가3456",
  verifyStatus: "APPROVED",
  rejectReason: null,
  docBizUrl: null,
  docVehicleUrl: null,
  docPermitUrl: null,
  recyclerName: "한국유지",
  recyclerContact: "025551234",
  isOnline: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  dealerId: "dealer-1",
  dealerName: "좌상갑",
  creditLimit: 50000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ ok: true, data: { userId: "sup-1", role: "supplier", updated: ["phone"] } });
  mockUseRiderCredits.mockReturnValue({ data: new Map() });
  mockUseUserRecentOrders.mockReturnValue({ data: [] });
});

describe("공급업체 상세·정보수정 (19 T4)", () => {
  it("기본정보와 포인트 잔액을 표시한다", () => {
    render(<UserDetailDrawer supplier={SUPPLIER} pointBalance={12000} onClose={vi.fn()} />);
    const info = screen.getByTestId("user-detail-info");
    expect(info).toHaveTextContent("행복식당");
    expect(info).toHaveTextContent("123-45-67890");
    expect(info).toHaveTextContent("12,000P");
  });

  it("바뀐 항목만 user-update로 보낸다(부분 수정)", async () => {
    render(<UserDetailDrawer supplier={SUPPLIER} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("user-edit-toggle"));
    fireEvent.change(screen.getByTestId("user-edit-phone"), { target: { value: "01099998888" } });
    fireEvent.click(screen.getByTestId("user-edit-save"));
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({
        userId: "sup-1",
        displayName: undefined,
        phone: "01099998888",
        storeName: undefined,
        bizNumber: undefined,
        address: undefined,
      }),
    );
  });

  it("변경이 없으면 호출하지 않고 안내한다", async () => {
    render(<UserDetailDrawer supplier={SUPPLIER} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("user-edit-toggle"));
    fireEvent.click(screen.getByTestId("user-edit-save"));
    expect(await screen.findByTestId("user-edit-error")).toHaveTextContent("변경된 항목이 없어요");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe("라이더 상세·정보수정 (19 T4)", () => {
  it("소속 좌상과 지급 한도를 표시한다(19 §0 누락 연결)", () => {
    mockUseRiderCredits.mockReturnValue({
      data: new Map([["rider-1", { limitAmount: 50000, used: 12000, available: 38000, isUnlimited: false, allocationMode: "PER_RIDER" as const }]]),
    });
    render(<UserDetailDrawer rider={RIDER} couponBalance={4} onClose={vi.fn()} />);
    const info = screen.getByTestId("user-detail-info");
    expect(info).toHaveTextContent("좌상갑");
    expect(info).toHaveTextContent("50,000P");
    expect(info).toHaveTextContent("사용 12,000P");
    expect(info).toHaveTextContent("4장");
  });

  it("재활용업체를 비우면 null(지움)로 보낸다", async () => {
    mockUpdateUser.mockResolvedValue({ ok: true, data: { userId: "rider-1", role: "rider", updated: ["recycler_name"] } });
    render(<UserDetailDrawer rider={RIDER} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("user-edit-toggle"));
    fireEvent.change(screen.getByTestId("user-edit-recycler-name"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("user-edit-save"));
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalled());
    expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ userId: "rider-1", recyclerName: null }));
  });

  it("승인상태·소속·한도 입력 필드를 두지 않는다(전용 경로 분리 — 19 §2)", () => {
    render(<UserDetailDrawer rider={RIDER} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("user-edit-toggle"));
    expect(screen.queryByTestId("user-edit-verify-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-edit-dealer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-edit-credit-limit")).not.toBeInTheDocument();
  });
});
