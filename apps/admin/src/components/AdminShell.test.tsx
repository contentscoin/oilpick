import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./AdminShell";

// 13 I3: role별 메뉴 분기 — admin은 전체+좌상 관리, dealer는 서브어드민 메뉴만.
const { mockUseCurrentRole } = vi.hoisted(() => ({ mockUseCurrentRole: vi.fn() }));
vi.mock("../hooks/useCurrentRole", () => ({ useCurrentRole: () => mockUseCurrentRole() }));
vi.mock("./NotificationsBell", () => ({ NotificationsBell: () => null }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { auth: { signOut: vi.fn() } } }));

function renderShell() {
  return render(
    <MemoryRouter>
      <AdminShell>
        <div>CONTENT</div>
      </AdminShell>
    </MemoryRouter>,
  );
}

describe("AdminShell role 메뉴 (13 I3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin은 전체 메뉴 + '좌상 관리'를 본다", () => {
    mockUseCurrentRole.mockReturnValue({ role: "admin", loading: false });
    renderShell();
    expect(screen.getByText("좌상 관리")).toBeInTheDocument();
    expect(screen.getByText("주문 관리")).toBeInTheDocument();
    expect(screen.getByText("시세 관리")).toBeInTheDocument();
    expect(screen.getByTestId("admin-role-label").textContent).toBe("관리자");
  });

  it("dealer는 서브어드민 메뉴만 본다(주문/시세/좌상관리 없음)", () => {
    mockUseCurrentRole.mockReturnValue({ role: "dealer", loading: false });
    renderShell();
    expect(screen.getByText("관할 대시보드")).toBeInTheDocument();
    expect(screen.getByText("소속 실적")).toBeInTheDocument();
    expect(screen.queryByText("주문 관리")).not.toBeInTheDocument();
    expect(screen.queryByText("좌상 관리")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-role-label").textContent).toBe("좌상");
  });
});

// [19 T3·T7] 메뉴 그룹 재구성 + 유통이력 신설. 라우트·role 게이트는 불변(표시 구조만 변경).
describe("AdminShell 메뉴 그룹 (19 T3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin 메뉴를 업무 그룹으로 묶고 '유통이력'을 노출한다", () => {
    mockUseCurrentRole.mockReturnValue({ role: "admin", loading: false });
    renderShell();
    for (const group of ["운영", "조직·회원", "정산·청구", "추적·분석", "지원"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByText("유통이력")).toBeInTheDocument();
  });

  it("dealer에게는 유통이력을 노출하지 않는다(admin 전용 — 19 §1 T2)", () => {
    mockUseCurrentRole.mockReturnValue({ role: "dealer", loading: false });
    renderShell();
    expect(screen.queryByText("유통이력")).not.toBeInTheDocument();
  });
});
