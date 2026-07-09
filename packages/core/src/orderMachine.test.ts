import { describe, expect, it } from "vitest";
import {
  canLegacyTransition,
  canTransition,
  getAvailableActions,
  getLegacyAvailableActions,
  getTransitionTarget,
  LEGACY_TRANSITIONS,
  ORDER_NONE,
  TRANSITIONS,
  type OrderAction,
  type OrderStatusOrNone,
  type UserRole,
} from "./orderMachine";

const ALL_STATUSES: OrderStatusOrNone[] = [
  ORDER_NONE,
  "REQUESTED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
];

const ALL_ACTIONS: OrderAction[] = [
  "CREATE",
  "ACCEPT",
  "ARRIVE",
  "SUBMIT_MEASURE",
  "CONFIRM_MEASURE",
  "DISPUTE",
  "RESOLVE_DISPUTE",
  "FORCE_COMPLETE",
  "DELIVER",
  "CANCEL",
];

const ALL_ROLES: UserRole[] = ["supplier", "rider", "admin"];

describe("orderMachine.canTransition — 00-domain.md 신 전이표(07 피벗) 전수 테스트", () => {
  // 00-domain.md 신 상태머신 표의 모든 행이 허용되는지 개별 확인 (행 순서 = 문서 표 순서).
  it.each([
    [ORDER_NONE, "CREATE", "supplier", true],
    ["REQUESTED", "ACCEPT", "rider", true],
    ["ACCEPTED", "ARRIVE", "rider", true],
    ["ARRIVED", "SUBMIT_MEASURE", "rider", true],
    ["ARRIVED", "CONFIRM_MEASURE", "supplier", true],
    ["ARRIVED", "DISPUTE", "supplier", true],
    ["DISPUTED", "RESOLVE_DISPUTE", "admin", true],
    ["ARRIVED", "FORCE_COMPLETE", "admin", true],
    ["REQUESTED", "CANCEL", "supplier", true],
    ["ACCEPTED", "CANCEL", "admin", true],
    ["ARRIVED", "CANCEL", "admin", true],
    ["DISPUTED", "CANCEL", "admin", true],
  ] as const)("%s + %s by %s => %s", (from, action, role, expected) => {
    expect(canTransition(from, action, role)).toBe(expected);
  });

  // 신모델 재정의 검증: CONFIRM_MEASURE는 COMPLETED 직행(PICKED_UP 아님), RESOLVE_DISPUTE는 ARRIVED 복귀.
  it("CONFIRM_MEASURE goes ARRIVED→COMPLETED (no PICKED_UP)", () => {
    expect(getTransitionTarget("ARRIVED", "CONFIRM_MEASURE", "supplier")).toBe("COMPLETED");
  });
  it("RESOLVE_DISPUTE goes DISPUTED→ARRIVED (not PICKED_UP/COMPLETED)", () => {
    expect(getTransitionTarget("DISPUTED", "RESOLVE_DISPUTE", "admin")).toBe("ARRIVED");
  });
  it("FORCE_COMPLETE goes ARRIVED→COMPLETED (admin, D6)", () => {
    expect(getTransitionTarget("ARRIVED", "FORCE_COMPLETE", "admin")).toBe("COMPLETED");
  });

  // 전수 테스트: 가능한 모든 (from, action, role) 조합 중 TRANSITIONS에 없는 것은 반드시 거부.
  const allCombinations = ALL_STATUSES.flatMap((from) =>
    ALL_ACTIONS.flatMap((action) => ALL_ROLES.map((role) => ({ from, action, role }))),
  );

  it(`covers all ${allCombinations.length} (from, action, role) combinations`, () => {
    expect(allCombinations.length).toBe(
      ALL_STATUSES.length * ALL_ACTIONS.length * ALL_ROLES.length,
    );
  });

  it.each(allCombinations)(
    "combination from=$from action=$action role=$role matches table membership exactly",
    ({ from, action, role }) => {
      const expected = TRANSITIONS.some(
        (rule) => rule.from === from && rule.action === action && rule.role === role,
      );
      expect(canTransition(from, action, role)).toBe(expected);
    },
  );

  it("rejects every combination not explicitly present in TRANSITIONS", () => {
    const tableSet = new Set(TRANSITIONS.map((r) => `${r.from}|${r.action}|${r.role}`));
    const rejectedCombos = allCombinations.filter(
      ({ from, action, role }) => !tableSet.has(`${from}|${action}|${role}`),
    );
    // 표에 없는 조합이 실제로 존재하는지 sanity check (테스트가 무의미해지지 않도록).
    expect(rejectedCombos.length).toBeGreaterThan(0);
    for (const { from, action, role } of rejectedCombos) {
      expect(canTransition(from, action, role)).toBe(false);
    }
  });

  it("cross-role rejection: same (from, action) with wrong role is denied", () => {
    expect(canTransition("REQUESTED", "ACCEPT", "supplier")).toBe(false);
    expect(canTransition("REQUESTED", "ACCEPT", "admin")).toBe(false);
    expect(canTransition("ARRIVED", "CONFIRM_MEASURE", "rider")).toBe(false);
    expect(canTransition("ARRIVED", "CONFIRM_MEASURE", "admin")).toBe(false);
    expect(canTransition("ACCEPTED", "CANCEL", "supplier")).toBe(false);
    expect(canTransition("ACCEPTED", "CANCEL", "rider")).toBe(false);
    // FORCE_COMPLETE는 admin 전용.
    expect(canTransition("ARRIVED", "FORCE_COMPLETE", "supplier")).toBe(false);
    expect(canTransition("ARRIVED", "FORCE_COMPLETE", "rider")).toBe(false);
  });

  it("terminal states have no outgoing transitions in the new machine", () => {
    for (const role of ALL_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(canTransition("COMPLETED", action, role)).toBe(false);
        expect(canTransition("CANCELLED", action, role)).toBe(false);
        expect(canTransition("DELIVERED", action, role)).toBe(false);
      }
    }
  });

  it("PICKED_UP has no NEW transitions (DELIVER is legacy-only)", () => {
    for (const role of ALL_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(canTransition("PICKED_UP", action, role)).toBe(false);
      }
    }
  });
});

describe("orderMachine.getTransitionTarget", () => {
  it("returns the destination status for a valid new transition", () => {
    expect(getTransitionTarget(ORDER_NONE, "CREATE", "supplier")).toBe("REQUESTED");
    expect(getTransitionTarget("REQUESTED", "ACCEPT", "rider")).toBe("ACCEPTED");
    expect(getTransitionTarget("ARRIVED", "SUBMIT_MEASURE", "rider")).toBe("ARRIVED");
    expect(getTransitionTarget("ARRIVED", "CONFIRM_MEASURE", "supplier")).toBe("COMPLETED");
    expect(getTransitionTarget("DISPUTED", "RESOLVE_DISPUTE", "admin")).toBe("ARRIVED");
    expect(getTransitionTarget("ARRIVED", "FORCE_COMPLETE", "admin")).toBe("COMPLETED");
    expect(getTransitionTarget("ARRIVED", "CANCEL", "admin")).toBe("CANCELLED");
    expect(getTransitionTarget("DISPUTED", "CANCEL", "admin")).toBe("CANCELLED");
  });

  it("returns undefined for an invalid transition (incl. legacy DELIVER)", () => {
    expect(getTransitionTarget("COMPLETED", "CANCEL", "admin")).toBeUndefined();
    expect(getTransitionTarget("REQUESTED", "ACCEPT", "supplier")).toBeUndefined();
    expect(getTransitionTarget("PICKED_UP", "DELIVER", "rider")).toBeUndefined();
  });
});

describe("orderMachine.getAvailableActions", () => {
  it("lists rider actions available from ARRIVED", () => {
    expect(getAvailableActions("ARRIVED", "rider")).toEqual(["SUBMIT_MEASURE"]);
  });

  it("lists supplier actions available from ARRIVED", () => {
    expect(getAvailableActions("ARRIVED", "supplier")).toEqual(["CONFIRM_MEASURE", "DISPUTE"]);
  });

  it("lists admin actions from ARRIVED (FORCE_COMPLETE + CANCEL)", () => {
    expect(getAvailableActions("ARRIVED", "admin")).toEqual(["FORCE_COMPLETE", "CANCEL"]);
  });

  it("returns empty array when role has no actions from that state", () => {
    expect(getAvailableActions("COMPLETED", "supplier")).toEqual([]);
    expect(getAvailableActions("REQUESTED", "admin")).toEqual([]);
  });

  it("admin can CANCEL from ACCEPTED and (RESOLVE_DISPUTE + CANCEL) from DISPUTED", () => {
    expect(getAvailableActions("ACCEPTED", "admin")).toEqual(["CANCEL"]);
    expect(getAvailableActions("DISPUTED", "admin")).toEqual(["RESOLVE_DISPUTE", "CANCEL"]);
  });
});

describe("orderMachine legacy transitions (PICKED_UP/DELIVERED 경로 분리)", () => {
  it("DELIVER from PICKED_UP is a legacy transition only", () => {
    expect(canLegacyTransition("PICKED_UP", "DELIVER", "rider")).toBe(true);
    // 신 전이 판정에서는 거부(분리 유지).
    expect(canTransition("PICKED_UP", "DELIVER", "rider")).toBe(false);
  });

  it("getLegacyAvailableActions lists DELIVER for a stuck PICKED_UP order", () => {
    expect(getLegacyAvailableActions("PICKED_UP", "rider")).toEqual(["DELIVER"]);
    expect(getLegacyAvailableActions("PICKED_UP", "supplier")).toEqual([]);
  });

  it("LEGACY_TRANSITIONS only contains the PICKED_UP→COMPLETED DELIVER path", () => {
    expect(LEGACY_TRANSITIONS).toHaveLength(1);
    expect(LEGACY_TRANSITIONS[0]).toMatchObject({
      from: "PICKED_UP",
      action: "DELIVER",
      role: "rider",
      to: "COMPLETED",
    });
  });

  it("legacy DELIVER is not present in the new TRANSITIONS table", () => {
    expect(TRANSITIONS.some((r) => r.action === "DELIVER")).toBe(false);
  });
});
