import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderHistory } from "./useOrderHistory";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from: mockFrom } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useOrderHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps rows to camelCase and reports no next page when under page size", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () =>
              Promise.resolve({
                data: [
                  {
                    id: "order-1",
                    status: "COMPLETED",
                    requested_kg: 30,
                    final_kg: 29.5,
                    supplier_point: 20650,
                    created_at: "2026-07-01T00:00:00Z",
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrderHistory("user-1", 0), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      items: [
        {
          id: "order-1",
          status: "COMPLETED",
          requestedKg: 30,
          finalKg: 29.5,
          supplierPoint: 20650,
          createdAt: "2026-07-01T00:00:00Z",
        },
      ],
      hasNextPage: false,
    });
  });

  it("reports hasNextPage true when more rows than page size are returned", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `order-${i}`,
      status: "COMPLETED",
      requested_kg: 30,
      final_kg: 29.5,
      supplier_point: 20650,
      created_at: "2026-07-01T00:00:00Z",
    }));
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrderHistory("user-1", 0), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(10);
    expect(result.current.data?.hasNextPage).toBe(true);
  });

  it("does not query when userId is undefined", () => {
    renderHook(() => useOrderHistory(undefined, 0), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
