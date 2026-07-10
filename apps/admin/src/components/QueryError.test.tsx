import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryError } from "./QueryError";

/**
 * 쿼리 실패 표면화 공통 컴포넌트 검증:
 * - 기본/커스텀 메시지 + "다시 시도" 버튼(onRetry 연결)
 * - colSpan이 있으면 테이블 행(<tr><td colSpan>)으로 렌더(테이블 tbody용)
 */
describe("QueryError", () => {
  it("기본 메시지와 다시 시도 버튼을 렌더하고, 클릭 시 onRetry를 호출한다", () => {
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);
    expect(screen.getByText("목록을 불러오지 못했어요")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("query-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("colSpan이 있으면 <tr><td colSpan>으로 래핑해 커스텀 메시지를 렌더한다", () => {
    const { container } = render(
      <table>
        <tbody>
          <QueryError onRetry={vi.fn()} colSpan={7} message="주문 목록을 불러오지 못했어요" />
        </tbody>
      </table>,
    );
    const cell = container.querySelector("td");
    expect(cell).toHaveAttribute("colspan", "7");
    expect(screen.getByText("주문 목록을 불러오지 못했어요")).toBeInTheDocument();
  });
});
