import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProfile } from "./useProfile";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins profiles + supplier_profiles into a single camelCase object", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: "user-1", display_name: "김사장" }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { store_name: "행복식당", address: "서울시 강서구" },
                error: null,
              }),
          }),
        }),
      };
    });

    const { result } = renderHook(() => useProfile("user-1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      id: "user-1",
      displayName: "김사장",
      storeName: "행복식당",
      address: "서울시 강서구",
    });
  });

  it("is disabled when userId is undefined", () => {
    const { result } = renderHook(() => useProfile(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
