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
    expect(UI.PageHeader).toBeTypeOf("function");
    expect(UI.Toast).toBeTypeOf("function");
    expect(UI.OfflineBanner).toBeTypeOf("function");
    expect(UI.useOnlineStatus).toBeTypeOf("function");
    expect(UI.EmptyState).toBeTypeOf("function");
    expect(UI.PhotoUploader).toBeTypeOf("function");
    expect(UI.MapView).toBeTypeOf("function");
    expect(UI.StatusBadge).toBeTypeOf("function");
    expect(UI.LedgerList).toBeTypeOf("function");
  });

  it("exports a shared input style matching the form-field spec", () => {
    // 여러 화면에서 반복되던 폼 입력 스타일을 단일 상수로 통일한 것.
    // 값이 바뀌면 앱 전체 입력이 함께 바뀌므로 스펙(터치 48 / base 16 / radius.button)을 고정한다.
    expect(UI.inputStyle.minHeight).toBe(UI.touchTarget);
    expect(UI.inputStyle.fontSize).toBe(UI.fontSize.base);
    expect(UI.inputStyle.borderRadius).toBe(UI.radius.button);
    // 경계색은 기존 하드코딩 값(#e4e4e7 = gray[200])과 동일해야 시각 변화 없이 토큰화된다.
    expect(UI.inputStyle.border).toBe(`1px solid ${UI.gray[200]}`);
    expect(UI.inputStyle.backgroundColor).toBe(UI.surface.card);
    expect(UI.inputClassName).toBe("oilpick-input");
  });
});
