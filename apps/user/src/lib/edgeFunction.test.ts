import { FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeEdgeFunction } from "./edgeFunction";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("./supabaseClient", () => ({ supabase: { functions: { invoke: mockInvoke } } }));

describe("invokeEdgeFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with the unwrapped data on success", async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, data: { orderId: "order-1" } }, error: null });
    const result = await invokeEdgeFunction<{ orderId: string }>("order-create", { requestedKg: 15 });
    expect(result).toEqual({ ok: true, data: { orderId: "order-1" } });
  });

  it("maps a known error code to its Korean message when the function returns 200 with ok:false", async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false, code: "TOO_MANY_ACTIVE", message: "ignored" }, error: null });
    const result = await invokeEdgeFunction("order-create", {});
    expect(result).toEqual({ ok: false, code: "TOO_MANY_ACTIVE", message: "진행 중인 주문이 너무 많아요. 완료 후 다시 요청해주세요." });
  });

  it("parses the { ok:false, code, message } body from a non-2xx FunctionsHttpError response", async () => {
    const response = new Response(JSON.stringify({ ok: false, code: "ALREADY_ACCEPTED", message: "ignored" }), {
      status: 409,
    });
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    const result = await invokeEdgeFunction("order-accept", { orderId: "order-1" });
    expect(result).toEqual({ ok: false, code: "ALREADY_ACCEPTED", message: "다른 라이더가 이미 수락했어요." });
  });

  it("falls back to a generic message when the error body cannot be parsed", async () => {
    const response = new Response("not json", { status: 500 });
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    const result = await invokeEdgeFunction("order-create", {});
    expect(result).toEqual({ ok: false, message: "요청 처리 중 오류가 발생했어요." });
  });
});
