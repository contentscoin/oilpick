import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnreadCount } from "./useUnreadCount";

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

/** useNotifications의 select→eq→order→limit 체인과 Realtime channel을 스텁한다. */
function stubNotifications(rows: Array<{ id: number; read_at: string | null }>) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () =>
            Promise.resolve({
              data: rows.map((row) => ({
                id: row.id,
                title: "제목",
                body: "본문",
                link: null,
                read_at: row.read_at,
                created_at: "2026-07-08T00:00:00Z",
              })),
              error: null,
            }),
        }),
      }),
    }),
  });
  mockChannel.mockReturnValue({ on: mockOn.mockReturnThis(), subscribe: mockSubscribe.mockReturnThis() });
}

describe("useUnreadCount (E7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only notifications with read_at null", async () => {
    stubNotifications([
      { id: 1, read_at: null },
      { id: 2, read_at: "2026-07-08T01:00:00Z" },
      { id: 3, read_at: null },
    ]);
    const { result } = renderHook(() => useUnreadCount("user-1"), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("returns 0 when every notification is read", async () => {
    stubNotifications([{ id: 1, read_at: "2026-07-08T01:00:00Z" }]);
    const { result } = renderHook(() => useUnreadCount("user-1"), { wrapper });
    // 초기 0 → 로드 후에도 0 유지(미읽음 없음).
    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("returns 0 and does not query when userId is undefined", () => {
    const { result } = renderHook(() => useUnreadCount(undefined), { wrapper });
    expect(result.current).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
