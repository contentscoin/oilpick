import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssignedRiderCard } from "./useAssignedRiderCard";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useAssignedRiderCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins profiles + rider_profiles into a single camelCase object", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: "rider-1", display_name: "박라이더", phone: "01011112222" }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: { vehicle_number: "12가3456", verify_status: "APPROVED" }, error: null }),
          }),
        }),
      };
    });

    const { result } = renderHook(() => useAssignedRiderCard("rider-1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      id: "rider-1",
      displayName: "박라이더",
      phone: "01011112222",
      vehicleNumber: "12가3456",
      verifyStatus: "APPROVED",
    });
  });

  it("is disabled when riderId is null", () => {
    const { result } = renderHook(() => useAssignedRiderCard(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
