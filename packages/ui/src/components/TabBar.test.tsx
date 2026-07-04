import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";

const items = [
  { key: "home", label: "홈" },
  { key: "pickup", label: "수거" },
  { key: "wallet", label: "포인트" },
  { key: "my", label: "마이" },
];

describe("TabBar", () => {
  it("renders all tab items and marks the active one", () => {
    render(<TabBar items={items} activeKey="pickup" onSelect={() => {}} />);
    expect(screen.getByTestId("tab-bar-item-pickup")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("tab-bar-item-home")).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect with the tapped tab key", () => {
    const onSelect = vi.fn();
    render(<TabBar items={items} activeKey="home" onSelect={onSelect} />);
    screen.getByTestId("tab-bar-item-wallet").click();
    expect(onSelect).toHaveBeenCalledWith("wallet");
  });
});
