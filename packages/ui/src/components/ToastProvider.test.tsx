import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message, options }: { message: string; options?: Parameters<ReturnType<typeof useToast>["showToast"]>[1] }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message, options)}>
      fire
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider (06 E6)", () => {
  it("showToast로 토스트 표시 → 기본 2.6초 후 자동 소멸", () => {
    render(
      <ToastProvider>
        <Trigger message="요청을 취소했어요" options={{ variant: "success" }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    expect(screen.getByTestId("toast")).toHaveTextContent("요청을 취소했어요");

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("동시 표시 최대 3개 — 초과분은 오래된 것부터 제거", () => {
    render(
      <ToastProvider>
        <Trigger message="t" />
      </ToastProvider>,
    );
    const btn = screen.getByText("fire");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getAllByTestId("toast")).toHaveLength(3);
  });

  it("onRetry 토스트: 재시도 클릭 시 콜백 실행 + 즉시 소멸, 자동 소멸은 6초", () => {
    const onRetry = vi.fn();
    render(
      <ToastProvider>
        <Trigger message="저장에 실패했어요" options={{ variant: "error", onRetry }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));

    // 2.6초로는 안 사라진다(재시도 여유 6초).
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.getByTestId("toast")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("toast-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("토스트 몸통 클릭으로 수동 소멸", () => {
    render(
      <ToastProvider>
        <Trigger message="닫기 테스트" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    fireEvent.click(screen.getByTestId("toast"));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("useToast를 프로바이더 밖에서 쓰면 명시적 에러", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger message="x" />)).toThrow("ToastProvider 안에서만");
    spy.mockRestore();
  });
});
