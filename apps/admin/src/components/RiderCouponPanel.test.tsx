import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RiderCouponPanel } from "./RiderCouponPanel";
import type { RiderCouponPurchaseRow } from "../hooks/useUsersAdmin";

/**
 * [17 Q4] 라이더탭 쿠폰 운영 패널 검증(07 F10-② 원형 테스트 복원 + 환불·확인 다이얼로그 추가):
 * - 쿠폰 잔액 표시(v_coupon_balance 값) / 미로드 '-'
 * - [쿠폰 조정]: memo 필수·qty≠0 클라이언트 검증(위반 시 호출 없음) → **확인 다이얼로그** 경유 후에만
 *   coupon-adjust 호출(취소하면 무실행) + INSUFFICIENT_COUPON 서버 에러 안내
 * - [구매 환불]: PAID 구매 목록 선택 + 수량(비우면 전액)·사유 필수 → **확인 다이얼로그** 경유 후
 *   coupon-refund 호출. 환불 가능 건 없으면 빈 상태
 * - 충전/조정 이력(coupon_ledger) 토글 렌더 + 빈 상태
 */

const { mockInvoke, mockLedger, mockPurchases } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockLedger: vi.fn(),
  mockPurchases: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useUsersAdmin", () => ({
  useRiderCouponLedger: (riderId: string, enabled: boolean) => mockLedger(riderId, enabled),
  useRiderCouponPurchases: (riderId: string, enabled: boolean) => mockPurchases(riderId, enabled),
}));

const PAID_PURCHASE: RiderCouponPurchaseRow = {
  id: "p-1",
  qty: 30,
  unitPrice: 1000,
  amount: 30000,
  pgOrderId: "CP20260805-0001",
  createdAt: "2026-08-01T00:00:00.000Z",
  paidAt: "2026-08-01T00:01:00.000Z",
};

function setup(balance: number | undefined = 12, purchases: RiderCouponPurchaseRow[] = [PAID_PURCHASE]) {
  mockLedger.mockReturnValue({ data: [], isLoading: false });
  mockPurchases.mockReturnValue({ data: purchases, isLoading: false });
  const onChanged = vi.fn();
  render(<RiderCouponPanel riderId="rider-1" riderName="데모 라이더" balance={balance} onChanged={onChanged} />);
  return { onChanged };
}

afterEach(() => {
  mockInvoke.mockReset();
  mockLedger.mockReset();
  mockPurchases.mockReset();
});

describe("RiderCouponPanel — 잔액·이력", () => {
  it("쿠폰 잔액을 표시한다", () => {
    setup(37);
    expect(screen.getByTestId("coupon-balance-rider-1")).toHaveTextContent("37장");
  });

  it("잔액 미로드 시 '-'를 표시한다", () => {
    // setup()의 기본 인자(12)를 타지 않도록 직접 렌더(undefined 전달은 기본값으로 대체되므로).
    mockLedger.mockReturnValue({ data: [], isLoading: false });
    mockPurchases.mockReturnValue({ data: [], isLoading: false });
    render(<RiderCouponPanel riderId="rider-1" balance={undefined} onChanged={vi.fn()} />);
    expect(screen.getByTestId("coupon-balance-rider-1")).toHaveTextContent(/^-$/);
  });

  it("이력 토글을 열면 라이더별 충전/조정 이력을 렌더한다(entry_type 라벨)", () => {
    mockLedger.mockReturnValue({
      data: [
        { id: 2, entryType: "ADJUST", qty: 20, memo: "선지급", createdAt: "2026-07-09T00:00:00.000Z" },
        { id: 1, entryType: "CHARGE", qty: 30, memo: null, createdAt: "2026-07-08T00:00:00.000Z" },
      ],
      isLoading: false,
    });
    mockPurchases.mockReturnValue({ data: [], isLoading: false });
    render(<RiderCouponPanel riderId="rider-2" balance={50} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId("coupon-ledger-toggle-rider-2"));

    const ledger = screen.getByTestId("coupon-ledger-rider-2");
    expect(ledger).toHaveTextContent("조정");
    expect(ledger).toHaveTextContent("충전");
    expect(ledger).toHaveTextContent("+20장");
    expect(ledger).toHaveTextContent("선지급");
  });

  it("이력이 없으면 빈 상태 문구를 렌더한다", () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-ledger-toggle-rider-1"));
    expect(screen.getByTestId("coupon-ledger-rider-1")).toHaveTextContent("쿠폰 이력이 없어요.");
  });
});

describe("RiderCouponPanel — 쿠폰 조정(coupon-adjust)", () => {
  it("memo 없이 제출하면 호출 없이 에러를 낸다(사유 필수)", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-modal"));

    expect(await screen.findByText("조정 사유(메모)를 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("qty가 0이면 호출 없이 에러를 낸다(couponAdjustInput qty≠0 계약)", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "테스트" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-modal"));

    expect(await screen.findByText(/0이 아닌 정수로 입력/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("제출은 확인 다이얼로그를 먼저 띄우고, [조정 확정] 후에만 coupon-adjust를 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { riderId: "rider-1", qty: 20 } });
    const { onChanged } = setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "데모 라이더 선지급" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-modal"));

    // 확인 다이얼로그가 뜨는 시점엔 아직 호출 없음(오탭 방지).
    const confirmDialog = await screen.findByTestId("coupon-adjust-confirm-dialog");
    expect(confirmDialog).toHaveTextContent("데모 라이더");
    expect(confirmDialog).toHaveTextContent("+20장");
    expect(mockInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("coupon-adjust-confirm"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-adjust", {
      riderId: "rider-1",
      qty: 20,
      memo: "데모 라이더 선지급",
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("확인 다이얼로그에서 [돌아가기]를 누르면 호출 없이 입력 폼으로 복귀한다", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "-3" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "회수" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-modal"));

    fireEvent.click(await screen.findByTestId("coupon-adjust-back"));
    expect(screen.queryByTestId("coupon-adjust-confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("coupon-adjust-qty")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("음수 조정이 잔액을 초과하면 INSUFFICIENT_COUPON 안내를 표시한다", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      message: "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요.",
    });
    setup(3);
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "-10" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "회수" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-modal"));
    fireEvent.click(await screen.findByTestId("coupon-adjust-confirm"));

    expect(await screen.findByTestId("coupon-adjust-error")).toHaveTextContent("수거쿠폰이 부족해요");
  });
});

describe("RiderCouponPanel — 구매 환불(coupon-refund)", () => {
  it("PAID 구매 건이 없으면 빈 상태를 렌더한다", () => {
    setup(12, []);
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    expect(screen.getByTestId("coupon-refund-empty")).toHaveTextContent("환불 가능한 결제 완료 구매 건이 없어요.");
  });

  it("구매 건 미선택 제출은 호출 없이 에러를 낸다", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-refund-reason"), { target: { value: "오결제" } });
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));

    expect(await screen.findByText("환불할 구매 건을 선택해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("사유 없이 제출하면 호출 없이 에러를 낸다(reason 필수)", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.click(screen.getByTestId("coupon-refund-purchase-p-1"));
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));

    expect(await screen.findByText("환불 사유를 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("환불 수량이 구매 수량을 넘으면 호출 없이 에러를 낸다", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.click(screen.getByTestId("coupon-refund-purchase-p-1"));
    fireEvent.change(screen.getByTestId("coupon-refund-qty"), { target: { value: "31" } });
    fireEvent.change(screen.getByTestId("coupon-refund-reason"), { target: { value: "오결제" } });
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));

    expect(await screen.findByText(/1~30장 사이의 정수로 입력/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("부분 환불: 확인 다이얼로그 경유 후 qty를 담아 coupon-refund를 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { purchaseId: "p-1", refundedQty: 5, balance: 7 } });
    const { onChanged } = setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.click(screen.getByTestId("coupon-refund-purchase-p-1"));
    fireEvent.change(screen.getByTestId("coupon-refund-qty"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("coupon-refund-reason"), { target: { value: "오결제 고객 요청" } });
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));

    // 확인 다이얼로그가 뜨는 시점엔 아직 호출 없음.
    const confirmDialog = await screen.findByTestId("coupon-refund-confirm-dialog");
    expect(confirmDialog).toHaveTextContent("5장");
    expect(mockInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("coupon-refund-confirm"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-refund", {
      purchaseId: "p-1",
      qty: 5,
      reason: "오결제 고객 요청",
    });

    // 성공 안내 → [닫기]로 onChanged 전파.
    expect(await screen.findByTestId("coupon-refund-success")).toHaveTextContent("쿠폰 5장이 환불되었어요");
    fireEvent.click(screen.getByTestId("coupon-refund-close"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("수량을 비우면 전액 환불로 qty 없이 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { purchaseId: "p-1", refundedQty: 30, balance: 0 } });
    setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.click(screen.getByTestId("coupon-refund-purchase-p-1"));
    fireEvent.change(screen.getByTestId("coupon-refund-reason"), { target: { value: "전액 취소" } });
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));
    const confirmDialog = await screen.findByTestId("coupon-refund-confirm-dialog");
    expect(confirmDialog).toHaveTextContent("전액 30장");

    fireEvent.click(screen.getByTestId("coupon-refund-confirm"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-refund", {
      purchaseId: "p-1",
      reason: "전액 취소",
    });
  });

  it("서버 에러(미사용 잔액 부족 등)는 폼으로 복귀해 표면화한다", async () => {
    mockInvoke.mockResolvedValue({ ok: false, message: "수거쿠폰이 부족해요. 충전 후 수락할 수 있어요." });
    setup();
    fireEvent.click(screen.getByTestId("coupon-refund-open-rider-1"));
    fireEvent.click(screen.getByTestId("coupon-refund-purchase-p-1"));
    fireEvent.change(screen.getByTestId("coupon-refund-reason"), { target: { value: "회수" } });
    fireEvent.submit(screen.getByTestId("coupon-refund-modal"));
    fireEvent.click(await screen.findByTestId("coupon-refund-confirm"));

    expect(await screen.findByTestId("coupon-refund-error")).toHaveTextContent("수거쿠폰이 부족해요");
    expect(screen.queryByTestId("coupon-refund-success")).not.toBeInTheDocument();
  });
});
