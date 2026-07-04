import { describe, expect, it } from "vitest";
import * as core from "./index";

describe("@oilpick/core barrel export", () => {
  it("re-exports constants, orderMachine, schemas, format, estimate, errorCodes, supabase", () => {
    expect(core.KG_PER_CAN).toBe(15);
    expect(core.MIN_WITHDRAW).toBe(10000);
    expect(core.BROADCAST_RADII).toEqual([3, 7, 15]);
    expect(core.CALL_ACCEPT_TIMEOUT_SEC).toBe(15);
    expect(typeof core.canTransition).toBe("function");
    expect(typeof core.orderCreateInputSchema.parse).toBe("function");
    expect(typeof core.formatPoint).toBe("function");
    expect(typeof core.estimateKg).toBe("function");
    expect(core.TOO_MANY_ACTIVE).toBe("TOO_MANY_ACTIVE");
    expect(typeof core.createOilpickSupabaseClient).toBe("function");
  });
});
