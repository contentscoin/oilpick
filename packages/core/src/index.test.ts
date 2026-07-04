import { describe, expect, it } from "vitest";
import { OILPICK_CORE_VERSION } from "./index";

describe("@oilpick/core placeholder", () => {
  it("exports a version string", () => {
    expect(OILPICK_CORE_VERSION).toBe("0.0.0");
  });
});
