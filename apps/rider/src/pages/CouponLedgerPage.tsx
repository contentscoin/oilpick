import { useNavigate } from "react-router-dom";
import { EmptyState, LedgerList, gray, radius, surface } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useCouponLedger } from "../hooks/useCoupons";

/**
 * R: 쿠폰 내역 화면 `/coupons` (07 F5-③). coupon_ledger 본인 행을 LedgerList(variant="coupon")로
 * 렌더 — CHARGE "충전"/CONSUME "콜 배정"/REFUND "환급"/ADJUST "조정(사유)" + 장 단위 부호 표기.
 * 콜 홈의 쿠폰 잔액 카드 탭으로 진입한다. 빈 상태는 EmptyState.
 */
export function CouponLedgerPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const riderId = session?.user.id;

  const { data: entries, isLoading, isError, refetch } = useCouponLedger(riderId);
  // 초기 로드 실패만 에러 UI로 — 백그라운드 refetch 실패는 캐시된 화면을 유지한다(TanStack v5는 error에도 data 보존).
  const loadFailed = isError && entries === undefined;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      {/* 헤더: 뒤로(<, gray-900) + "쿠폰 내역"(중앙). */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          data-testid="coupon-ledger-back"
          aria-label="뒤로가기"
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -12, background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0, color: gray[900], lineHeight: 1 }}
        >
          &lt;
        </button>
        <h1 style={{ fontSize: 16, margin: 0, flex: 1, fontWeight: 700, textAlign: "center", color: gray[900] }}>
          쿠폰 내역
        </h1>
        <span aria-hidden style={{ width: 32 }} />
      </div>

      {isLoading ? (
        <div data-testid="coupon-ledger-skeleton" style={{ borderRadius: 16, height: 200, backgroundColor: gray[100] }} />
      ) : loadFailed ? (
        // 쿼리 실패는 빈 상태로 위장하지 않는다 — 에러 분기가 빈 상태 분기보다 먼저다.
        <div data-testid="query-error">
          <EmptyState
            title="불러오지 못했어요"
            description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
            action={
              <button
                type="button"
                data-testid="query-error-retry"
                onClick={() => refetch()}
                style={{
                  minHeight: 44,
                  padding: "0 20px",
                  borderRadius: radius.button,
                  border: `1px solid ${surface.border}`,
                  backgroundColor: surface.card,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                다시 시도
              </button>
            }
          />
        </div>
      ) : entries && entries.length > 0 ? (
        <LedgerList variant="coupon" entries={entries} />
      ) : (
        <EmptyState title="아직 쿠폰 내역이 없어요" description="쿠폰을 충전하거나 콜을 수락하면 여기에 표시돼요." />
      )}
    </main>
  );
}
