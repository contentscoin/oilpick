import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RiderCouponPanel } from "./RiderCouponPanel";

/**
 * 07 F10-② 라이더탭 쿠폰 운영 검증:
 * - 쿠폰 잔액 표시(v_coupon_balance 값)
 * - [수동 조정] 모달: memo 필수/qty≠0 클라이언트 검증(위반 시 호출 없음)
 * - 성공 시 coupon-adjust 페이로드 + onAdjusted 콜백
 * - 음수 조정 잔액 초과(INSUFFICIENT_COUPON) 서버 에러 안내
 * - 충전/조정 이력(coupon_ledger) 토글 렌더
 */

const { mockInvoke, mockLedger } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockLedger: vi.fn(),
}));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useUsersAdmin", () => ({
  useRiderCouponLedger: (riderId: string, enabled: boolean) => mockLedger(riderId, enabled),
}));

function setup(balance: number | undefined = 12) {
  mockLedger.mockReturnValue({ data: [], isLoading: false });
  const onAdjusted = vi.fn();
  render(<RiderCouponPanel riderId="rider-1" balance={balance} onAdjusted={onAdjusted} />);
  return { onAdjusted };
}

afterEach(() => {
  mockInvoke.mockReset();
  mockLedger.mockReset();
});

describe("RiderCouponPanel", () => {
  it("쿠폰 잔액을 표시한다", () => {
    setup(37);
    expect(screen.getByTestId("coupon-balance-rider-1")).toHaveTextContent("37장");
  });

  it("잔액 미로드 시 '-'를 표시한다", () => {
    // setup()의 기본 인자(12)를 타지 않도록 직접 렌더(undefined 전달은 기본값으로 대체되므로).
    mockLedger.mockReturnValue({ data: [], isLoading: false });
    render(<RiderCouponPanel riderId="rider-1" balance={undefined} onAdjusted={vi.fn()} />);
    expect(screen.getByTestId("coupon-balance-rider-1")).toHaveTextContent(/^-$/);
  });

  it("조정 모달에서 memo 없이 제출하면 호출 없이 에러를 낸다(사유 필수)", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-submit"));

    expect(await screen.findByText("조정 사유(메모)를 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("qty가 0이면 호출 없이 에러를 낸다(couponAdjustInput qty≠0 계약)", async () => {
    setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "테스트" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-submit"));

    expect(await screen.findByText(/0이 아닌 정수로 입력/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("정상 제출 시 coupon-adjust 페이로드로 호출하고 onAdjusted를 부른다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { riderId: "rider-1", qty: 20 } });
    const { onAdjusted } = setup();
    fireEvent.click(screen.getByTestId("coupon-adjust-open-rider-1"));
    fireEvent.change(screen.getByTestId("coupon-adjust-qty"), { target: { value: "20" } });
    fireEvent.change(screen.getByTestId("coupon-adjust-memo"), { target: { value: "데모 라이더 선지급" } });
    fireEvent.submit(screen.getByTestId("coupon-adjust-submit"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("coupon-adjust", {
      riderId: "rider-1",
      qty: 20,
      memo: "데모 라이더 선지급",
    });
    await waitFor(() => expect(onAdjusted).toHaveBeenCalled());
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
    fireEvent.submit(screen.getByTestId("coupon-adjust-submit"));

    expect(await screen.findByTestId("coupon-adjust-error")).toHaveTextContent("수거쿠폰이 부족해요");
  });

  it("이력 토글을 열면 라이더별 충전/조정 이력을 렌더한다(entry_type 라벨)", () => {
    mockLedger.mockReturnValue({
      data: [
        { id: 2, entryType: "ADJUST", qty: 20, memo: "선지급", createdAt: "2026-07-09T00:00:00.000Z" },
        { id: 1, entryType: "CHARGE", qty: 30, memo: null, createdAt: "2026-07-08T00:00:00.000Z" },
      ],
      isLoading: false,
    });
    render(<RiderCouponPanel riderId="rider-2" balance={50} onAdjusted={vi.fn()} />);
    fireEvent.click(screen.getByTestId("coupon-ledger-toggle-rider-2"));

    const ledger = screen.getByTestId("coupon-ledger-rider-2");
    expect(ledger).toHaveTextContent("조정");
    expect(ledger).toHaveTextContent("충전");
    expect(ledger).toHaveTextContent("+20장");
    expect(ledger).toHaveTextContent("선지급");
  });
});
