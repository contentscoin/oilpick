import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner, useOnlineStatus } from "./OfflineBanner";

/**
 * navigator.onLine은 jsdom에서 읽기 전용 getter라 직접 대입이 안 되므로
 * defineProperty로 스텁하고, online/offline 이벤트를 수동 dispatch해 전이를 검증한다.
 */
function setOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  setOnLine(true);
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("온라인일 때는 아무것도 렌더하지 않는다", () => {
    setOnLine(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("초기 렌더 시 오프라인이면 배너를 표시한다", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("인터넷 연결이 끊겼어요");
  });

  it("offline/online 이벤트에 따라 배너가 나타났다 사라진다", () => {
    setOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("message prop으로 문구를 오버라이드할 수 있다", () => {
    setOnLine(false);
    render(<OfflineBanner message="오프라인 상태예요" />);
    expect(screen.getByTestId("offline-banner")).toHaveTextContent("오프라인 상태예요");
  });
});

describe("useOnlineStatus", () => {
  it("navigator.onLine 초기값을 반영한다", () => {
    setOnLine(false);
    let current: boolean | undefined;
    function Probe() {
      current = useOnlineStatus();
      return null;
    }
    render(<Probe />);
    expect(current).toBe(false);
  });
});
