import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@oilpick/ui";
import { ReferralsPage } from "./ReferralsPage";

// 09 H4【R】내 추천 — 코드·공유링크 + 실적(가입/활성화/전환율/보상).

const { mockUseSession, mockUseReferralCode, mockUseReferralStats } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseReferralCode: vi.fn(),
  mockUseReferralStats: vi.fn(),
}));

vi.mock("../hooks/useSession", () => ({ useSession: mockUseSession }));
vi.mock("../hooks/useReferral", () => ({
  useReferralCode: mockUseReferralCode,
  useReferralStats: mockUseReferralStats,
}));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ReferralsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("ReferralsPage (09 H4 rider)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ session: { user: { id: "rider-1" } }, loading: false });
    mockUseReferralCode.mockReturnValue(
      ok({ code: "ABCD2345", shareUrl: "https://app.oilpick.kr/ref/ABCD2345" }),
    );
    mockUseReferralStats.mockReturnValue(
      ok({
        referrer_rider_id: "rider-1",
        signed_up: 4,
        activated: 3,
        supplier_bonus_paid: 15000,
        rider_reward_earned: 9000,
        rider_reward_settled: 3000,
        rider_reward_unsettled: 6000,
      }),
    );
  });

  it("추천코드와 공유 링크를 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("referral-code-value").textContent).toBe("ABCD2345");
    expect(screen.getByTestId("referral-share-url").textContent).toContain(
      "https://app.oilpick.kr/ref/ABCD2345",
    );
  });

  it("실적(가입/활성화/전환율)과 누적 보상을 렌더한다", () => {
    renderPage();
    expect(screen.getByTestId("referral-signed-up").textContent).toContain("4");
    expect(screen.getByTestId("referral-activated").textContent).toContain("3");
    // 전환율 = round(3/4*100) = 75%.
    expect(screen.getByTestId("referral-conversion").textContent).toContain("75");
    // 누적 추천 보상 9,000 P.
    expect(screen.getByTestId("referral-reward").textContent).toContain("9,000");
  });

  it("실적이 없으면 0으로 표기한다(추천 없는 라이더)", () => {
    mockUseReferralStats.mockReturnValue(ok(null));
    renderPage();
    expect(screen.getByTestId("referral-signed-up").textContent).toContain("0");
    expect(screen.getByTestId("referral-conversion").textContent).toContain("0");
  });

  it("[09 H8] 정산 이력이 있으면 완료/대기 분리 표기, 없으면 안내 문구", () => {
    renderPage();
    expect(screen.getByTestId("referral-reward-settle").textContent).toBe(
      "정산 완료 3,000원 · 대기 6,000원",
    );

    mockUseReferralStats.mockReturnValue(
      ok({
        referrer_rider_id: "rider-1",
        signed_up: 1,
        activated: 1,
        supplier_bonus_paid: 5000,
        rider_reward_earned: 3000,
        rider_reward_settled: 0,
        rider_reward_unsettled: 3000,
      }),
    );
    renderPage();
    expect(screen.getAllByTestId("referral-reward-settle")[1]?.textContent).toBe(
      "정산 시 지급 (오프라인 정산)",
    );
  });
});
