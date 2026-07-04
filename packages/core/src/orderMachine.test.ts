import { describe, expect, it } from "vitest";
import {
  canTransition,
  getAvailableActions,
  getTransitionTarget,
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
  "DELIVER",
  "CANCEL",
];

const ALL_ROLES: UserRole[] = ["supplier", "rider", "admin"];

describe("orderMachine.canTransition — 00-domain.md 전이표 전수 테스트", () => {
  // 00-domain.md 표의 모든 행이 허용되는지 개별 확인 (행 순서 = 문서 표 순서).
  it.each([
    [ORDER_NONE, "CREATE", "supplier", true],
    ["REQUESTED", "ACCEPT", "rider", true],
    ["ACCEPTED", "ARRIVE", "rider", true],
    ["ARRIVED", "SUBMIT_MEASURE", "rider", true],
    ["ARRIVED", "CONFIRM_MEASURE", "supplier", true],
    ["ARRIVED", "DISPUTE", "supplier", true],
    ["DISPUTED", "RESOLVE_DISPUTE", "admin", true],
    ["PICKED_UP", "DELIVER", "rider", true],
    ["REQUESTED", "CANCEL", "supplier", true],
    ["ACCEPTED", "CANCEL", "admin", true],
  ] as const)("%s + %s by %s => %s", (from, action, role, expected) => {
    expect(canTransition(from, action, role)).toBe(expected);
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
  });

  it("terminal/exception states have no outgoing transitions", () => {
    for (const role of ALL_ROLES) {
      for (const action of ALL_ACTIONS) {
        expect(canTransition("COMPLETED", action, role)).toBe(false);
        expect(canTransition("CANCELLED", action, role)).toBe(false);
        expect(canTransition("DELIVERED", action, role)).toBe(false);
      }
    }
  });
});

describe("orderMachine.getTransitionTarget", () => {
  it("returns the destination status for a valid transition", () => {
    expect(getTransitionTarget(ORDER_NONE, "CREATE", "supplier")).toBe("REQUESTED");
    expect(getTransitionTarget("REQUESTED", "ACCEPT", "rider")).toBe("ACCEPTED");
    expect(getTransitionTarget("ARRIVED", "SUBMIT_MEASURE", "rider")).toBe("ARRIVED");
    expect(getTransitionTarget("ARRIVED", "CONFIRM_MEASURE", "supplier")).toBe("PICKED_UP");
    expect(getTransitionTarget("DISPUTED", "RESOLVE_DISPUTE", "admin")).toBe("PICKED_UP");
    expect(getTransitionTarget("PICKED_UP", "DELIVER", "rider")).toBe("COMPLETED");
  });

  it("returns undefined for an invalid transition", () => {
    expect(getTransitionTarget("COMPLETED", "CANCEL", "admin")).toBeUndefined();
    expect(getTransitionTarget("REQUESTED", "ACCEPT", "supplier")).toBeUndefined();
  });
});

describe("orderMachine.getAvailableActions", () => {
  it("lists rider actions available from ARRIVED", () => {
    expect(getAvailableActions("ARRIVED", "rider")).toEqual(["SUBMIT_MEASURE"]);
  });

  it("lists supplier actions available from ARRIVED", () => {
    expect(getAvailableActions("ARRIVED", "supplier")).toEqual(["CONFIRM_MEASURE", "DISPUTE"]);
  });

  it("returns empty array when role has no actions from that state", () => {
    expect(getAvailableActions("COMPLETED", "supplier")).toEqual([]);
    expect(getAvailableActions("REQUESTED", "admin")).toEqual([]);
  });

  it("admin can only CANCEL from ACCEPTED and RESOLVE_DISPUTE from DISPUTED", () => {
    expect(getAvailableActions("ACCEPTED", "admin")).toEqual(["CANCEL"]);
    expect(getAvailableActions("DISPUTED", "admin")).toEqual(["RESOLVE_DISPUTE"]);
  });
});
