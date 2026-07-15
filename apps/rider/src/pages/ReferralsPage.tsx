import { colors, elevation, gradient, gray, radius, surface, useToast } from "@oilpick/ui";
import { REFERRAL_SUPPLIER_BONUS, formatPoint } from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { useReferralCode, useReferralStats } from "../hooks/useReferral";

/**
 * [09 H4]【R】"내 추천". 마이에서 진입. 내 추천코드·공유 링크(복사/공유) + 실적(가입/활성화/전환율/보상).
 * 코드/링크는 referral-code Edge(useReferralCode), 실적은 v_referral_stats(useReferralStats, referrals
 * Realtime로 갱신). 라이더 보상은 오프라인 정산 근거로만 표기한다(08 P5 — 라이더 지갑 없음).
 */
export function ReferralsPage() {
  const { session } = useSession();
  const riderId = session?.user.id;
  const { showToast } = useToast();

  const { data: codeData, isLoading: codeLoading, isError: codeError, refetch: refetchCode } =
    useReferralCode(Boolean(riderId));
  const { data: stats, isLoading: statsLoading } = useReferralStats(riderId);

  const signedUp = stats?.signed_up ?? 0;
  const activated = stats?.activated ?? 0;
  const conversion = signedUp > 0 ? Math.round((activated / signedUp) * 100) : 0;
  const rewardEarned = stats?.rider_reward_earned ?? 0;

  async function handleCopy() {
    if (!codeData) return;
    try {
      await navigator.clipboard.writeText(codeData.shareUrl);
      showToast("공유 링크를 복사했어요", { variant: "success" });
    } catch {
      showToast("복사에 실패했어요", { variant: "error" });
    }
  }

  async function handleShare() {
    if (!codeData) return;
    const shareData = {
      title: "오일픽 — 폐식용유 현장 정산",
      text: `추천코드 ${codeData.code}로 가입하면 첫 수거 완료 시 ${formatPoint(REFERRAL_SUPPLIER_BONUS)} 보너스를 받아요.`,
      url: codeData.shareUrl,
    };
    // Web Share API(모바일 WebView 포함) 우선, 없으면 링크 복사로 폴백.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
      } catch {
        // 사용자가 취소했거나 실패 — 조용히 무시(복사 폴백은 별도 버튼 제공).
      }
      return;
    }
    await handleCopy();
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>내 추천</h1>
        <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
          점주에게 앱을 소개하고 첫 수거가 완료되면 추천 실적이 쌓여요.
        </p>
      </div>

      {/* 코드·공유 링크 카드 */}
      {codeLoading ? (
        <div data-testid="referral-code-skeleton" style={{ borderRadius: radius.hero, height: 150, backgroundColor: gray[100] }} />
      ) : codeError || !codeData ? (
        <section
          data-testid="referral-code-error"
          style={{ borderRadius: radius.card, padding: 20, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>추천코드를 불러오지 못했어요.</p>
          <button
            type="button"
            data-testid="referral-code-retry"
            onClick={() => refetchCode()}
            style={{ alignSelf: "flex-start", minHeight: 44, padding: "0 20px", borderRadius: radius.button, border: `1px solid ${surface.border}`, backgroundColor: surface.card, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            다시 시도
          </button>
        </section>
      ) : (
        <section
          data-testid="referral-code-card"
          style={{ display: "flex", flexDirection: "column", gap: 14, padding: "24px 20px", borderRadius: radius.hero, background: gradient.point, boxShadow: elevation.raised, color: "#FFFFFF" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>내 추천코드</span>
            <span data-testid="referral-code-value" className="oilpick-tabular-nums" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "0.08em" }}>
              {codeData.code}
            </span>
          </div>
          <div
            data-testid="referral-share-url"
            style={{ fontSize: 13, wordBreak: "break-all", color: "rgba(255,255,255,0.9)", backgroundColor: "rgba(0,0,0,0.12)", borderRadius: radius.button, padding: "10px 12px" }}
          >
            {codeData.shareUrl}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="referral-copy-button"
              onClick={handleCopy}
              style={{ flex: 1, minHeight: 44, borderRadius: radius.button, border: "none", backgroundColor: "rgba(255,255,255,0.18)", color: "#FFFFFF", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              링크 복사
            </button>
            <button
              type="button"
              data-testid="referral-share-button"
              onClick={handleShare}
              style={{ flex: 1, minHeight: 44, borderRadius: radius.button, border: "none", backgroundColor: "#FFFFFF", color: colors.primary.dark, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              공유하기
            </button>
          </div>
        </section>
      )}

      {/* 실적 */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 15, margin: 0, color: colors.status.wait }}>내 추천 실적</h2>
        {statsLoading ? (
          <div data-testid="referral-stats-skeleton" style={{ borderRadius: radius.card, height: 96, backgroundColor: gray[100] }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <StatCard testId="referral-signed-up" label="가입" value={`${signedUp}`} unit="명" />
              <StatCard testId="referral-activated" label="활성화" value={`${activated}`} unit="명" />
              <StatCard testId="referral-conversion" label="전환율" value={`${conversion}`} unit="%" />
            </div>
            <div
              data-testid="referral-reward"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>누적 추천 보상</span>
                <span style={{ fontSize: 12, color: colors.status.wait }}>정산 시 지급 (오프라인 정산)</span>
              </div>
              <span className="oilpick-tabular-nums" style={{ fontSize: 22, fontWeight: 800, color: colors.accent.deep }}>
                {formatPoint(rewardEarned)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 안내 */}
      <section
        style={{ borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, fontSize: 13, lineHeight: 1.6, color: colors.status.wait }}
      >
        <p style={{ margin: 0, fontWeight: 700, color: colors.primary.DEFAULT }}>추천은 이렇게 진행돼요</p>
        <p style={{ margin: "8px 0 0" }}>
          1. 위 링크·코드를 점주에게 공유해요.
          <br />
          2. 점주가 코드로 가입해요(가입 = "가입" 실적).
          <br />
          3. 점주가 첫 수거를 완료하면 활성화 — 점주는 보너스 포인트, 회원님은 추천 보상이 쌓여요.
        </p>
      </section>
    </main>
  );
}

/** 실적 3분할 카드(가입/활성화/전환율). */
function StatCard({ testId, label, value, unit }: { testId: string; label: string; value: string; unit: string }) {
  return (
    <div
      data-testid={testId}
      style={{ flex: 1, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.status.wait }}>{label}</p>
      <p className="oilpick-tabular-nums" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800, color: colors.primary.DEFAULT }}>
        {value}
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.status.wait }}>{unit}</span>
      </p>
    </div>
  );
}
