import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorScreen } from "./ErrorScreen";

describe("ErrorScreen", () => {
  it("renders the default title when none is provided", () => {
    render(<ErrorScreen />);
    expect(screen.getByTestId("error-screen")).toBeInTheDocument();
    expect(screen.getByText("문제가 발생했어요")).toBeInTheDocument();
  });

  it("renders the given title and description", () => {
    render(<ErrorScreen title="페이지를 찾을 수 없어요" description="주소가 바뀌었거나 삭제된 화면일 수 있어요." />);
    expect(screen.getByText("페이지를 찾을 수 없어요")).toBeInTheDocument();
    expect(screen.getByText("주소가 바뀌었거나 삭제된 화면일 수 있어요.")).toBeInTheDocument();
  });

  it("renders the action node", () => {
    render(
      <ErrorScreen
        title="문제가 발생했어요"
        action={
          <button type="button" data-testid="error-action">
            홈으로
          </button>
        }
      />,
    );
    const action = screen.getByTestId("error-action");
    expect(action).toBeInTheDocument();
    expect(action).toHaveTextContent("홈으로");
    // 액션은 error-screen 내부에 렌더된다.
    expect(screen.getByTestId("error-screen")).toContainElement(action);
  });
});
