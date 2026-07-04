import { describe, expect, it } from "vitest";
import { OILPICK_UI_VERSION } from "./index";

describe("@oilpick/ui placeholder", () => {
  it("exports a version string", () => {
    expect(OILPICK_UI_VERSION).toBe("0.0.0");
  });
});
