import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrder } from "./useOrder";

const { mockFrom, mockChannel, mockOn, mockSubscribe, mockRemoveChannel } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockOn: vi.fn(),
  mockSubscribe: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const ORDER_ROW = {
  id: "order-1",
  status: "ARRIVED",
  supplier_id: "supplier-1",
  rider_id: "rider-1",
  depot_id: null,
  requested_cans: 2,
  requested_kg: 30,
  pickup_address: "서울시 강서구",
  pickup_location: "0101000020E6100000713D0AD7A3B45F40E6AE25E483C64240",
  preferred_time: "지금",
  snapshot_price_per_kg: 700,
  snapshot_rider_fee: 5000,
  measured_kg: 29.5,
  final_kg: null,
  supplier_point: null,
  coupon_cost: 2,
  cash_paid_amount: null,
  photo_urls: ["https://example.com/photo.jpg"],
  cancel_reason: null,
  dispute_reason: null,
  created_at: "2026-07-01T00:00:00Z",
  accepted_at: "2026-07-01T00:05:00Z",
  picked_up_at: null,
  delivered_at: null,
  completed_at: null,
};

describe("useOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps an order row to camelCase", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: ORDER_ROW, error: null }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    const { result } = renderHook(() => useOrder("order-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: "order-1",
      status: "ARRIVED",
      supplierId: "supplier-1",
      riderId: "rider-1",
      depotId: null,
      requestedCans: 2,
      requestedKg: 30,
      pickupAddress: "서울시 강서구",
      pickupLat: expect.closeTo(37.5509, 3),
      pickupLng: expect.closeTo(126.8225, 3),
      preferredTime: "지금",
      snapshotPricePerKg: 700,
      snapshotRiderFee: 5000,
      measuredKg: 29.5,
      finalKg: null,
      supplierPoint: null,
      couponCost: 2,
      cashPaidAmount: null,
      photoUrls: ["https://example.com/photo.jpg"],
      cancelReason: null,
      disputeReason: null,
      createdAt: "2026-07-01T00:00:00Z",
      acceptedAt: "2026-07-01T00:05:00Z",
      pickedUpAt: null,
      deliveredAt: null,
      completedAt: null,
    });
  });

  it("subscribes to postgres_changes filtered by order id", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: ORDER_ROW, error: null }),
        }),
      }),
    });
    mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });

    renderHook(() => useOrder("order-1"), { wrapper });
    await waitFor(() => expect(mockChannel).toHaveBeenCalledWith("pickup_orders_detail_order-1"));
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "UPDATE", table: "pickup_orders", filter: "id=eq.order-1" }),
      expect.any(Function),
    );
  });

  it("does not query when orderId is undefined", () => {
    renderHook(() => useOrder(undefined), { wrapper });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
