import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RiderVerifyCard } from "./RiderVerifyCard";
import type { AdminRiderRow } from "../hooks/useUsersAdmin";

/**
 * 07 F11 라이더 관리 강화 검증:
 * - APPROVED 카드: [정지] 버튼 + 사유 필수(없으면 호출 없음), 성공 시 rider-verify SUSPENDED 페이로드
 * - SUSPENDED 카드: 정지 사유 표시 + [정지 해제] 버튼 → REINSTATED 페이로드
 * - 신고증명서(doc_permit_url) 필수 뱃지: 미제출 표시
 * - 인계처(recycler) 표시: 미등록 시 "승인 불가" 경고
 * - 승인 서버 거부(VALIDATION_ERROR message) 에러 표시
 */

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("../lib/edgeFunction", () => ({ invokeEdgeFunction: mockInvoke }));
vi.mock("../hooks/useUsersAdmin", () => ({
  createRiderDocSignedUrl: vi.fn().mockResolvedValue("https://signed.example/doc.jpg"),
}));

function makeRider(overrides: Partial<AdminRiderRow> = {}): AdminRiderRow {
  return {
    id: "rider-1",
    displayName: "김라이더",
    phone: "010-1111-2222",
    bizNumber: "123-45-67890",
    vehicleNumber: "12가 3456",
    verifyStatus: "PENDING",
    rejectReason: null,
    docBizUrl: "u/biz.jpg",
    docVehicleUrl: "u/vehicle.jpg",
    docPermitUrl: "u/permit.jpg",
    recyclerName: "한빛자원",
    recyclerContact: "02-000-0000",
    // [19 T4] 소속 좌상·개인 한도(회원 관리 누락 연결 보강)
    dealerId: null,
    dealerName: null,
    creditLimit: null,
    isOnline: false,
    createdAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  mockInvoke.mockReset();
});

describe("RiderVerifyCard (07 F11)", () => {
  it("APPROVED 라이더에 [정지] 버튼과 사유 입력을 렌더한다", () => {
    render(<RiderVerifyCard rider={makeRider({ verifyStatus: "APPROVED" })} onProcessed={vi.fn()} />);
    expect(screen.getByTestId("suspend-rider-rider-1")).toHaveTextContent("정지");
    expect(screen.getByTestId("suspend-reason-rider-1")).toBeInTheDocument();
    expect(screen.queryByTestId("reinstate-rider-rider-1")).not.toBeInTheDocument();
  });

  it("정지 사유 없이 [정지]를 누르면 호출 없이 에러를 낸다(사유 필수)", async () => {
    render(<RiderVerifyCard rider={makeRider({ verifyStatus: "APPROVED" })} onProcessed={vi.fn()} />);
    fireEvent.click(screen.getByTestId("suspend-rider-rider-1"));
    expect(await screen.findByText("정지 사유를 입력해주세요.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("사유와 함께 [정지]를 누르면 rider-verify SUSPENDED 페이로드로 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { riderId: "rider-1", verifyStatus: "SUSPENDED" } });
    const onProcessed = vi.fn();
    render(<RiderVerifyCard rider={makeRider({ verifyStatus: "APPROVED" })} onProcessed={onProcessed} />);
    fireEvent.change(screen.getByTestId("suspend-reason-rider-1"), { target: { value: "무단 미인계 신고" } });
    fireEvent.click(screen.getByTestId("suspend-rider-rider-1"));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("rider-verify", {
      riderId: "rider-1",
      decision: "SUSPENDED",
      rejectReason: "무단 미인계 신고",
    });
    await waitFor(() => expect(onProcessed).toHaveBeenCalled());
  });

  it("SUSPENDED 라이더에 정지 사유와 [정지 해제] 버튼을 렌더하고 REINSTATED로 호출한다", async () => {
    mockInvoke.mockResolvedValue({ ok: true, data: { riderId: "rider-1", verifyStatus: "APPROVED" } });
    const onProcessed = vi.fn();
    render(
      <RiderVerifyCard
        rider={makeRider({ verifyStatus: "SUSPENDED", rejectReason: "무단 미인계 신고" })}
        onProcessed={onProcessed}
      />,
    );
    expect(screen.getByTestId("rider-status-rider-1")).toHaveTextContent("정지됨");
    expect(screen.getByText(/정지 사유: 무단 미인계 신고/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reinstate-rider-rider-1"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("rider-verify", { riderId: "rider-1", decision: "REINSTATED" });
    await waitFor(() => expect(onProcessed).toHaveBeenCalled());
  });

  it("신고증명서 미제출 시 필수 뱃지(미제출)를 표시한다", () => {
    render(<RiderVerifyCard rider={makeRider({ docPermitUrl: null })} onProcessed={vi.fn()} />);
    expect(screen.getByText("미제출")).toBeInTheDocument();
    expect(screen.getByText("신고증명서")).toBeInTheDocument();
  });

  it("인계처를 표시하고, 미등록이면 승인 불가 경고를 낸다", () => {
    const { rerender } = render(<RiderVerifyCard rider={makeRider()} onProcessed={vi.fn()} />);
    expect(screen.getByTestId("rider-recycler-rider-1")).toHaveTextContent("한빛자원 · 02-000-0000");

    rerender(
      <RiderVerifyCard rider={makeRider({ recyclerName: null, recyclerContact: null })} onProcessed={vi.fn()} />,
    );
    expect(screen.getByTestId("rider-recycler-rider-1")).toHaveTextContent("미등록 — 승인 불가");
  });

  it("승인이 서버에서 거부되면(신고증명서 없음 400) 에러 메시지를 표시한다", async () => {
    mockInvoke.mockResolvedValue({
      ok: false,
      message: "폐기물처리(수집·운반) 신고증명서가 없어 승인할 수 없어요. 신고증명서 업로드가 필수예요.",
    });
    render(<RiderVerifyCard rider={makeRider({ docPermitUrl: null })} onProcessed={vi.fn()} />);
    fireEvent.click(screen.getByTestId("approve-rider-rider-1"));
    expect(await screen.findByText(/신고증명서가 없어 승인할 수 없어요/)).toBeInTheDocument();
  });
});
