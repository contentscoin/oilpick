import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberFlow } from "./NumberFlow";

/** jsdom에는 matchMedia가 없다. reduced-motion 분기를 검증하려면 직접 심는다. */
function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("NumberFlow", () => {
  afterEach(() => {
    // @ts-expect-error 테스트 간 격리를 위해 심어둔 스텁을 제거한다.
    delete window.matchMedia;
    vi.restoreAllMocks();
  });

  it("renders the initial value without animating on mount", () => {
    render(<NumberFlow value={42000} />);
    expect(screen.getByTestId("number-flow-visual")).toHaveTextContent("42,000");
  });

  it("exposes the final value to assistive tech, not the interpolated one", () => {
    render(<NumberFlow value={42000} />);
    // 접근성 텍스트는 보간과 무관하게 항상 최종값이다(15 원칙 4).
    expect(screen.getByTestId("number-flow-a11y")).toHaveTextContent("42,000");
  });

  it("hides the animated value from the accessibility tree", () => {
    render(<NumberFlow value={1000} />);
    expect(screen.getByTestId("number-flow-visual")).toHaveAttribute("aria-hidden", "true");
  });

  it("applies a custom formatter", () => {
    render(<NumberFlow value={18400} format={(n) => `${Math.round(n).toLocaleString("ko-KR")}P`} />);
    expect(screen.getByTestId("number-flow-a11y")).toHaveTextContent("18,400P");
  });

  it("jumps straight to the new value when reduced motion is requested", () => {
    stubReducedMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { rerender } = render(<NumberFlow value={0} />);
    rerender(<NumberFlow value={99000} />);

    expect(screen.getByTestId("number-flow-visual")).toHaveTextContent("99,000");
    // 보간 프레임을 아예 요청하지 않아야 한다.
    expect(raf).not.toHaveBeenCalled();
  });

  it("animates toward the new value when motion is allowed", () => {
    stubReducedMotion(false);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1 as unknown as number);
    const { rerender } = render(<NumberFlow value={0} />);
    rerender(<NumberFlow value={99000} />);

    expect(raf).toHaveBeenCalled();
    // 애니메이션이 걸려 있어도 접근성 텍스트는 즉시 최종값.
    expect(screen.getByTestId("number-flow-a11y")).toHaveTextContent("99,000");
  });
});
