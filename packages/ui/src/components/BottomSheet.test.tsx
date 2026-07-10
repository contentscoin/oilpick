import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

afterEach(() => {
  // reduced-motion 테스트가 심은 matchMedia mock 정리(jsdom 기본은 미구현 → 훅이 false 반환).
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

describe("BottomSheet", () => {
  it("renders nothing when closed", () => {
    render(
      <BottomSheet open={false} onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    expect(screen.queryByTestId("bottom-sheet")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <BottomSheet open onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    expect(screen.getByText("제목")).toBeInTheDocument();
    expect(screen.getByText("내용")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="제목">
        내용
      </BottomSheet>,
    );
    screen.getByTestId("bottom-sheet-backdrop").click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // 05 2026-07-10 폴리시: 진입 모션 상태머신 — 첫 프레임은 숨김(translateY(100%)/opacity 0),
  // rAF 이후 표시로 전환된다. 이 전환이 깨지면 시트가 "영영 투명"인 조용한 실패가 되므로
  // 보임 전환 자체를 단언한다.
  it("slides up after the enter frame (motion state machine)", async () => {
    render(
      <BottomSheet open onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    const sheet = screen.getByTestId("bottom-sheet");
    const backdrop = screen.getByTestId("bottom-sheet-backdrop");
    // mount 직후: 숨김 상태에서 시작(트랜지션의 from).
    expect(sheet).toHaveStyle({ transform: "translateY(100%)" });
    expect(backdrop).toHaveStyle({ opacity: "0" });
    // rAF 콜백이 entered=true로 전환하면 보임 상태가 된다.
    await waitFor(() => {
      expect(sheet).toHaveStyle({ transform: "translateY(0)" });
      expect(backdrop).toHaveStyle({ opacity: "1" });
    });
  });

  it("shows immediately without transition when prefers-reduced-motion", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(
      <BottomSheet open onClose={() => {}} title="제목">
        내용
      </BottomSheet>,
    );
    const sheet = screen.getByTestId("bottom-sheet");
    // rAF를 기다리지 않고 즉시 보임 + 트랜지션 없음.
    expect(sheet).toHaveStyle({ transform: "translateY(0)" });
    expect(sheet.style.transition).toBe("");
  });
});
