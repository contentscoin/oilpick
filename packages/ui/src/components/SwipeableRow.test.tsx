import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwipeableRow } from "./SwipeableRow";

describe("SwipeableRow", () => {
  it("renders its content", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}}>
        <div>계량 완료 정산</div>
      </SwipeableRow>,
    );
    expect(screen.getByText("계량 완료 정산")).toBeInTheDocument();
  });

  it("keeps the action reachable without swiping", () => {
    // 스와이프가 액션의 유일한 경로면 키보드·스크린리더 사용자는 접근할 수 없다.
    const onAction = vi.fn();
    render(
      <SwipeableRow actionLabel="영수증" onAction={onAction}>
        <div>행</div>
      </SwipeableRow>,
    );
    fireEvent.click(screen.getByRole("button", { name: "영수증" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("opens when the action receives keyboard focus", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}}>
        <div>행</div>
      </SwipeableRow>,
    );
    expect(screen.getByTestId("swipeable-row")).toHaveAttribute("data-open", "false");

    fireEvent.focus(screen.getByTestId("swipeable-action"));
    expect(screen.getByTestId("swipeable-row")).toHaveAttribute("data-open", "true");
  });

  it("closes again when focus leaves", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}}>
        <div>행</div>
      </SwipeableRow>,
    );
    const action = screen.getByTestId("swipeable-action");
    fireEvent.focus(action);
    fireEvent.blur(action);
    expect(screen.getByTestId("swipeable-row")).toHaveAttribute("data-open", "false");
  });

  // jsdom의 PointerEvent는 clientX를 싣지 않는다. MouseEvent로 같은 타입을 쏘면
  // React가 onPointerDown/Move/Up 핸들러를 그대로 호출하면서 좌표도 전달된다.
  function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientX: number) {
    fireEvent(el, new MouseEvent(type, { clientX, bubbles: true, cancelable: true, button: 0 }));
  }

  it("opens on a leftward drag past the halfway point", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}} actionWidth={80}>
        <div>행</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-content");
    pointer(content, "pointerdown", 200);
    pointer(content, "pointermove", 140); // -60px, 절반(40) 초과
    pointer(content, "pointerup", 140);

    expect(screen.getByTestId("swipeable-row")).toHaveAttribute("data-open", "true");
  });

  it("snaps back when the drag stops short", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}} actionWidth={80}>
        <div>행</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-content");
    pointer(content, "pointerdown", 200);
    pointer(content, "pointermove", 185); // -15px, 절반(40) 미만
    pointer(content, "pointerup", 185);

    expect(screen.getByTestId("swipeable-row")).toHaveAttribute("data-open", "false");
  });

  it("does not drag rightward past the closed position", () => {
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}}>
        <div>행</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-content");
    pointer(content, "pointerdown", 100);
    pointer(content, "pointermove", 260); // 오른쪽으로 끌어도 0에서 멈춘다

    expect(content).toHaveStyle({ transform: "translateX(0px)" });
  });

  it("ignores pointer events that carry no coordinates", () => {
    // 좌표 없는 합성 이벤트에 NaN 변환이 새어 나가지 않아야 한다.
    render(
      <SwipeableRow actionLabel="영수증" onAction={() => {}}>
        <div>행</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-content");
    fireEvent.pointerDown(content, { button: 0, pointerType: "touch" });
    fireEvent.pointerMove(content, { pointerType: "touch" });

    expect(content).toHaveStyle({ transform: "translateX(0px)" });
  });
});
