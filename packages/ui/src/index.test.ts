import { describe, expect, it } from "vitest";
import * as UI from "./index";

describe("@oilpick/ui barrel", () => {
  it("exports design tokens and all components", () => {
    expect(UI.colors.primary.DEFAULT).toBe("#1B7A43");
    expect(UI.radius.card).toBe(16);
    expect(UI.PriceCard).toBeTypeOf("function");
    expect(UI.OrderTimeline).toBeTypeOf("function");
    expect(UI.CallCard).toBeTypeOf("function");
    expect(UI.PointBalanceCard).toBeTypeOf("function");
    expect(UI.BigButton).toBeTypeOf("function");
    expect(UI.QtyStepper).toBeTypeOf("function");
    expect(UI.BottomSheet).toBeTypeOf("function");
    expect(UI.TabBar).toBeTypeOf("function");
    expect(UI.Toast).toBeTypeOf("function");
    expect(UI.OfflineBanner).toBeTypeOf("function");
    expect(UI.useOnlineStatus).toBeTypeOf("function");
    expect(UI.EmptyState).toBeTypeOf("function");
    expect(UI.PhotoUploader).toBeTypeOf("function");
    expect(UI.MapView).toBeTypeOf("function");
    expect(UI.StatusBadge).toBeTypeOf("function");
    expect(UI.LedgerList).toBeTypeOf("function");
  });
});
