import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallCard } from "./CallCard";

describe("CallCard", () => {
  it("renders distance, estimated kg, and 예상 매입 지급액", () => {
    render(<CallCard distanceKm={3.2} estimatedKg={45} estimatedCash={72000} />);
    // 리치 레이아웃: 거리 숫자와 단위(km)는 별도 노드로 분리되어 카드 전체 텍스트에 함께 나타난다.
    expect(screen.getByTestId("call-card")).toHaveTextContent("3.2km");
    expect(screen.getByText(/45\.0kg/)).toBeInTheDocument();
    expect(screen.getByTestId("call-card-cash")).toHaveTextContent("72,000원");
    // [15] 목록에선 라벨을 "지급액"으로 줄이고, 뜻(라이더가 점주에게 줄 돈)은 접근성 이름에 남긴다.
    expect(screen.getByText("지급액")).toBeInTheDocument();
    expect(screen.getByLabelText("예상 매입 지급액 72,000원")).toBeInTheDocument();
  });

  it("[08 G6-②] 쿠폰 칩 없음 — 쿠폰 모델 폐기", () => {
    render(<CallCard distanceKm={1} estimatedKg={30} estimatedCash={48000} />);
    expect(screen.queryByTestId("call-card-coupon")).not.toBeInTheDocument();
    expect(screen.getByTestId("call-card")).not.toHaveTextContent("쿠폰");
    expect(screen.getByTestId("call-card-cash")).toHaveTextContent("48,000원");
  });

  it("renders the address when provided", () => {
    render(
      <CallCard
        distanceKm={1}
        estimatedKg={15}
        estimatedCash={24000}
        address="서울시 강남구 테헤란로 123"
      />,
    );
    expect(screen.getByText("서울시 강남구 테헤란로 123")).toBeInTheDocument();
  });

  it("distanceKm이 null이면 '—'로 표시한다(좌표 없음/위치 미확보, 12 S1)", () => {
    render(<CallCard distanceKm={null} estimatedKg={20} estimatedCash={32000} />);
    const card = screen.getByTestId("call-card");
    expect(card).toHaveTextContent("—km");
    expect(card).not.toHaveTextContent("0.0km");
  });

  it("calls onClick when tapped", () => {
    const onClick = vi.fn();
    render(<CallCard distanceKm={1} estimatedKg={15} estimatedCash={24000} onClick={onClick} />);
    screen.getByTestId("call-card").click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  // [N5] 점주 희망 시간 — 보조행 아래 줄 "🕐 {값}". 저장 문자열 그대로(레거시 "지금" 포함).
  it("[N5] renders the preferred time on its own line below the subtitle", () => {
    render(
      <CallCard
        distanceKm={3.2}
        estimatedKg={45}
        estimatedCash={72000}
        address="서울시 강남구 테헤란로 123"
        preferredTime="2026-08-06 09:30"
      />,
    );
    const line = screen.getByTestId("call-card-preferred");
    expect(line).toHaveTextContent("🕐 2026-08-06 09:30");
    // 거리·수량 보조행과 같은 줄이 아니라 별도 노드다.
    expect(line.textContent).not.toContain("km");
  });

  it("[N5] does not render the preferred-time line when the value is absent", () => {
    const { rerender } = render(<CallCard distanceKm={1} estimatedKg={15} estimatedCash={24000} />);
    expect(screen.queryByTestId("call-card-preferred")).not.toBeInTheDocument();
    // null(조회값 없음)도 동일하게 미렌더.
    rerender(<CallCard distanceKm={1} estimatedKg={15} estimatedCash={24000} preferredTime={null} />);
    expect(screen.queryByTestId("call-card-preferred")).not.toBeInTheDocument();
  });
});
