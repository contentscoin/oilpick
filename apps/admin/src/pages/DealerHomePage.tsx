import { useMemo, useState } from "react";
import { ARRIVED_STALE_MS, ORDER_STATUS_LABEL, formatKg } from "@oilpick/core";
import {
  useDealerActiveOrders,
  useMyRiders,
  useMyRiderStats,
  useMyDealerAccount,
  useDealerScopeMutations,
  type DealerActiveOrder,
  type DealerRiderRow,
} from "../hooks/useDealerScope";
import { Badge, Button, Card, EmptyState, Gauge, PageHeader, SearchInput, StatCard, TextInput } from "../components/ui";

/**
 * [16 L9 §6-1] 라이더 관리 액션 다이얼로그 — rider-verify가 이미 지원하는 4-decision
 * (APPROVED/REJECTED/SUSPENDED/REINSTATED)의 UI 완성. 서버·훅 변경 0(권한 확대 없음).
 * 반려·정지는 사유 필수(서버도 강제), 파괴적 액션(반려·정지·소속 해제)은 확인을 거친다.
 */
type RiderActionType = "reject" | "suspend" | "unassign";

interface RiderActionState {
  type: RiderActionType;
  rider: DealerRiderRow;
}

const ACTION_COPY: Record<RiderActionType, { title: string; confirm: string; needsReason: boolean; message: (name: string) => string }> = {
  reject: {
    title: "서류 반려",
    confirm: "반려",
    needsReason: true,
    message: (name) => `${name} 라이더의 서류를 반려해요. 사유는 라이더에게 전달돼요.`,
  },
  suspend: {
    title: "라이더 정지",
    confirm: "정지",
    needsReason: true,
    message: (name) => `${name} 라이더를 정지해요. 정지 중에는 콜을 받을 수 없어요.`,
  },
  unassign: {
    title: "소속 해제",
    confirm: "해제",
    needsReason: false,
    message: (name) => `${name} 라이더를 내 소속에서 해제해요. 미배정(본사 직속)으로 돌아가요.`,
  },
};

/**
 * 13 I4【dealer】 관할 대시보드 — 요약 KPI + 소속 라이더 목록 + 승인/해제.
 * [16 L6] '진행중 운행' 관제 섹션 추가 — v_dealer_active_orders(조회 전용, 상태 액션 없음 —
 * 13 D3 불변) + 확인 지연 배지(arrived_at 24h, admin 하이라이트와 동일 기준) + 라이더 전화 CTA.
 */
export function DealerHomePage() {
  const { data: riders, isLoading } = useMyRiders();
  const { data: stats } = useMyRiderStats();
  const { data: activeOrders } = useDealerActiveOrders();
  const { verifyRider, unassign, setRiderLimit } = useDealerScopeMutations();
  // [18 R1·R5] 내 좌상 계정 — 배분 모드·총 한도. 모드에 따라 라이더 행의 배분 입력이 갈린다.
  const { data: account } = useMyDealerAccount();
  const allocatedTotal = (riders ?? []).reduce((sum, r) => sum + (r.creditLimit ?? 0), 0);
  // 오버부킹(배분 합계 > 총 한도)은 저장은 허용하되 경고한다(18 R5) — 실제 지급은 총량 게이트가 막는다.
  const allocatedOver = account != null && allocatedTotal > account.creditLimit;

  const total = riders?.length ?? 0;
  const approved = riders?.filter((r) => r.verifyStatus === "APPROVED").length ?? 0;
  const pending = riders?.filter((r) => r.verifyStatus === "PENDING").length ?? 0;
  const collectedKg = (stats ?? []).reduce((s, r) => s + Number(r.collected_kg), 0);
  // [19 T6] KPI를 인원수 축에서 실적·크레딧 축까지 넓힌다(19 §0 "누락 정보").
  // v_dealer_rider_stats는 completed_count·cash_paid·point_paid를 이미 주는데 화면에서
  // collected_kg·coupon_used_qty만 쓰고 있었다 — 남은 값을 마저 연결한다.
  const completedCount = (stats ?? []).reduce((s, r) => s + r.completed_count, 0);
  const paidTotal = (stats ?? []).reduce((s, r) => s + r.cash_paid + r.point_paid, 0);
  const activeCount = activeOrders?.length ?? 0;

  // [19 T6] 소속 라이더 검색 — 인원이 늘면 평면 목록에서 특정 라이더를 못 찾는다.
  const [riderKeyword, setRiderKeyword] = useState("");
  const filteredRiders = useMemo(() => {
    const k = riderKeyword.trim().toLowerCase();
    if (!k) return riders ?? [];
    return (riders ?? []).filter((r) =>
      [r.name, r.phone ?? "", r.verifyStatus].some((v) => v.toLowerCase().includes(k)),
    );
  }, [riders, riderKeyword]);
  const statsById = useMemo(() => new Map((stats ?? []).map((s) => [s.rider_id, s])), [stats]);
  // [16 L6] 라이더 전화 CTA — 현 소속 라이더의 연락처(useMyRiders — p_profiles_read_own_riders).
  // 전 소속(재배정) 라이더는 맵에 없어 CTA 미렌더(PII 최소화, 뷰 표시명 폴백과 동일 원칙).
  const riderPhones = new Map((riders ?? []).map((r) => [r.id, r.phone]));
  // [17 Q5] 쿠폰 실적 — v_dealer_rider_stats.coupon_used_qty(완료 주문 coupon_cost 합).
  // 조회 전용(정산 무관, 17 C5) — 통계 행이 아직 없으면 0장.
  const couponUsed = new Map((stats ?? []).map((s) => [s.rider_id, s.coupon_used_qty]));

  // [16 L9] 파괴적 액션(반려·정지·해제) 확인 다이얼로그 + 사유 입력.
  const [action, setAction] = useState<RiderActionState | null>(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  function openAction(type: RiderActionType, rider: DealerRiderRow) {
    setAction({ type, rider });
    setReason("");
  }

  async function confirmAction() {
    if (!action) return;
    const copy = ACTION_COPY[action.type];
    if (copy.needsReason && reason.trim() === "") return; // 버튼 disabled와 이중 방어
    setActionBusy(true);
    if (action.type === "reject") await verifyRider(action.rider.id, "REJECTED", reason.trim());
    else if (action.type === "suspend") await verifyRider(action.rider.id, "SUSPENDED", reason.trim());
    else await unassign(action.rider.id);
    setActionBusy(false);
    setAction(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="관할 대시보드" description="내 소속 라이더 현황과 실적을 한눈에 확인해요." />

      {/* [19 T6] KPI 6종 — 인원(3) + 운영(진행중) + 실적(완료·수거kg). 크레딧은 아래 전용 카드. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="dealer-kpi">
        <StatCard label="소속 라이더" value={`${total}명`} sub={`승인 완료 ${approved}명`} />
        <StatCard label="승인 대기" value={`${pending}명`} tone={pending > 0 ? "accent" : "neutral"} />
        <StatCard label="진행중 운행" value={`${activeCount}건`} data-testid="dealer-kpi-active" />
        <StatCard label="완료 주문" value={`${completedCount}건`} data-testid="dealer-kpi-completed" />
        <StatCard label="누적 수거" value={formatKg(collectedKg)} />
        <StatCard
          label="누적 지급액"
          value={`${paidTotal.toLocaleString()}원`}
          sub="현금 + 포인트 합계(표시용)"
          tone="accent"
          data-testid="dealer-kpi-paid"
        />
      </div>

      {/* [19 T6] 크레딧 현황 — 지금까지 소속 라이더 카드 안에 텍스트로만 있던 값을 게이지로 승격. */}
      {account && (
        <Card
          title="크레딧 현황"
          description={
            account.allocationMode === "PER_RIDER"
              ? "라이더별로 나눠 준 한도 안에서 포인트가 지급돼요."
              : "소속 라이더가 총 한도를 함께 써요(선착순)."
          }
          data-testid="dealer-credit-card"
        >
          <Gauge
            used={account.usage}
            limit={account.creditLimit}
            label={
              <>
                <span>
                  미정산 사용 {account.usage.toLocaleString()}P / 총 한도 {account.creditLimit.toLocaleString()}P
                </span>
                <span className="tabular-nums">잔여 {account.headroom.toLocaleString()}P</span>
              </>
            }
          />
          {account.allocationMode === "PER_RIDER" && (
            <p
              className={`mt-2 text-xs ${allocatedOver ? "font-semibold text-status-danger" : "text-gray-500"}`}
              data-testid="dealer-alloc-summary"
            >
              배분 합계 {allocatedTotal.toLocaleString()}P
              {allocatedOver && " — 총 한도를 넘었어요(실제 지급은 총 한도에서 막혀요)"}
            </p>
          )}
        </Card>
      )}

      {/* [16 L6] 진행중 운행 관제 — 감지(지연 배지)→개입(전화)이 화면 안에서 닫힌다. */}
      <div className="rounded-card bg-white p-6 shadow-card" data-testid="dealer-active-orders">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">진행중 운행</h2>
        <p className="mb-4 text-xs text-gray-500">
          소속 라이더가 배정된 진행중 주문이에요. 상태 변경은 라이더·점주·본사만 할 수 있어요.
        </p>
        {activeOrders && activeOrders.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {activeOrders.map((o) => (
              <ActiveOrderRow key={o.orderId} order={o} phone={o.riderId ? (riderPhones.get(o.riderId) ?? null) : null} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500" data-testid="dealer-active-empty">
            지금 진행중인 운행이 없어요.
          </p>
        )}
      </div>

      <div className="rounded-card bg-white p-4 shadow-card sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">소속 라이더</h2>
        {/* [17 Q5] 쿠폰 사용은 조회 전용 실적 — 정산 무관 카피(17 C5, 좌상 오해 방지). */}
        <p className="mb-2 text-xs text-gray-500">쿠폰 사용은 플랫폼 실적 확인용이에요 — 정산과는 무관해요.</p>

        {/* [18 R1·R5 → 19 T6] 배분 모드 안내. 숫자(사용/한도/잔여)는 위 '크레딧 현황' 카드로 승격했고,
            여기엔 모드별 행동 안내만 남긴다(같은 값을 두 번 읽게 하지 않는다).
            ※ 이전 구현의 border-danger/bg-danger/text-danger는 프리셋에 없는 색이라 통째로 죽어
            있었다 — status-danger로 교정(19 §0). */}
        {account && (
          <div
            data-testid="dealer-credit-summary"
            className={`mb-4 rounded-card border p-3 text-xs ${
              allocatedOver
                ? "border-status-danger/40 bg-status-danger/5 text-status-danger"
                : "border-gray-100 bg-gray-50 text-gray-600"
            }`}
          >
            {account.allocationMode === "PER_RIDER" ? (
              <>
                <p className="font-semibold">라이더별 한도 배분 중</p>
                <p className="mt-1">
                  아래에서 라이더별 지급 한도를 정하세요. 한도가 없는 라이더는 포인트 지급을 할 수 없어요.
                  {allocatedOver && " 배분 합계가 총 한도를 넘었어요(실제 지급은 총 한도에서 막혀요)."}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">총량 공유 중(선착순)</p>
                <p className="mt-1">
                  소속 라이더가 총 한도를 함께 써요. 라이더별로 나눠 주려면 본사에 <b>라이더별 배분 모드</b> 전환을
                  요청하세요.
                </p>
              </>
            )}
          </div>
        )}

        {/* [19 T6] 라이더 검색 */}
        <div className="mb-3">
          <SearchInput
            value={riderKeyword}
            onValueChange={setRiderKeyword}
            label="라이더 검색 (이름·연락처·상태)"
            className="w-full sm:w-72"
            data-testid="dealer-rider-search"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : filteredRiders.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="dealer-rider-list">
            {filteredRiders.map((r) => (
              <li
                key={r.id}
                data-testid={`dealer-rider-${r.id}`}
                className="flex flex-col gap-2 rounded-card border border-gray-100 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                    <span className="min-w-0">{r.name}</span>
                    {r.isOnline && <Badge tone="primary">온라인</Badge>}
                  </p>
                  <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    <span>{r.verifyStatus}</span>
                    <span>{r.phone ?? "연락처 없음"}</span>
                    <span data-testid={`coupon-used-${r.id}`}>쿠폰 사용 {couponUsed.get(r.id) ?? 0}장</span>
                  </p>
                  {/* [19 T6] 라이더별 실적 — v_dealer_rider_stats가 이미 주던 완료건·수거kg·지급액을
                      화면에 마저 연결한다(지금까지 쿠폰 수치만 쓰고 나머지는 버려졌다). */}
                  {statsById.get(r.id) && (
                    <p
                      className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500"
                      data-testid={`rider-stats-${r.id}`}
                    >
                      <span>완료 {statsById.get(r.id)!.completed_count}건</span>
                      <span>수거 {formatKg(Number(statsById.get(r.id)!.collected_kg))}</span>
                      <span>
                        지급 {(statsById.get(r.id)!.cash_paid + statsById.get(r.id)!.point_paid).toLocaleString()}원
                      </span>
                    </p>
                  )}
                  {/* [18 R5] 배분 모드일 때만 라이더별 한도 입력. 사용액을 함께 보여 남은 몫을 가늠하게 한다. */}
                  {account?.allocationMode === "PER_RIDER" && (
                    <RiderLimitField
                      rider={r}
                      onSave={(limit) => setRiderLimit(r.id, limit)}
                    />
                  )}
                </div>
                {/* [16 L9] verify_status별 4-decision 액션 — 서버(rider-verify)가 이미 허용하는
                    액션의 노출뿐(전이 유효성은 Edge/guard가 최종 판정). 파괴적 액션은 다이얼로그. */}
                <div className="flex flex-wrap gap-2">
                  {r.verifyStatus === "PENDING" && (
                    <>
                      <Button variant="primary" size="sm" data-testid={`approve-${r.id}`} onClick={() => verifyRider(r.id, "APPROVED")}>
                        승인
                      </Button>
                      <Button size="sm" data-testid={`reject-${r.id}`} onClick={() => openAction("reject", r)}>
                        반려
                      </Button>
                    </>
                  )}
                  {r.verifyStatus === "APPROVED" && (
                    <Button size="sm" data-testid={`suspend-${r.id}`} onClick={() => openAction("suspend", r)}>
                      정지
                    </Button>
                  )}
                  {r.verifyStatus === "SUSPENDED" && (
                    <Button variant="primary" size="sm" data-testid={`reinstate-${r.id}`} onClick={() => verifyRider(r.id, "REINSTATED")}>
                      정지 해제
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" data-testid={`unassign-${r.id}`} onClick={() => openAction("unassign", r)}>
                    소속 해제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={riderKeyword ? "조건에 맞는 라이더가 없어요." : "소속 라이더가 없어요."}
            description={
              riderKeyword ? "검색어를 지우면 전체 목록으로 돌아가요." : "본사에 배정을 요청하거나 라이더를 모집해 배정하세요."
            }
            data-testid="dealer-rider-empty"
          />
        )}
      </div>

      {/* [16 L9] 확인 다이얼로그 — 대상 라이더명·결과 명시, 반려·정지는 사유 필수(오탭 방지). */}
      {action && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-testid="rider-action-dialog"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-card bg-white p-6 shadow-card">
            <h3 className="text-lg font-semibold text-gray-900">{ACTION_COPY[action.type].title}</h3>
            <p className="mt-2 text-sm text-gray-600">{ACTION_COPY[action.type].message(action.rider.name)}</p>
            {ACTION_COPY[action.type].needsReason && (
              <textarea
                data-testid="rider-action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="사유를 입력하세요 (라이더에게 전달돼요)"
                rows={3}
                className="mt-3 w-full rounded-button border border-gray-200 p-2 text-sm"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-testid="rider-action-cancel"
                onClick={() => setAction(null)}
                className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="rider-action-confirm"
                disabled={actionBusy || (ACTION_COPY[action.type].needsReason && reason.trim() === "")}
                onClick={() => void confirmAction()}
                className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card disabled:opacity-50"
              >
                {ACTION_COPY[action.type].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** [16 L6] 진행중 운행 행 — 상태 pill + 지연 배지 + 라이더 전화. 조회 전용(액션 없음). */
function ActiveOrderRow({ order, phone }: { order: DealerActiveOrder; phone: string | null }) {
  // 확인 지연: ARRIVED로 24시간 초과 체류(admin OrdersPage 하이라이트와 동일 기준 ARRIVED_STALE_MS).
  const stale =
    order.status === "ARRIVED" &&
    order.arrivedAt != null &&
    Date.now() - new Date(order.arrivedAt).getTime() > ARRIVED_STALE_MS;
  const statusClass =
    order.status === "DISPUTED"
      ? "bg-red-50 text-red-600"
      : order.status === "ARRIVED"
        ? "bg-amber-50 text-amber-700"
        : "bg-primary-light text-primary";
  return (
    <li
      data-testid={`dealer-active-${order.orderId}`}
      className="flex flex-col gap-2 rounded-card border border-gray-100 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
          <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          <span className="min-w-0">{order.riderName}</span>
          {stale && (
            <span
              data-testid={`dealer-active-stale-${order.orderId}`}
              className="rounded-pill bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600"
            >
              확인 지연
            </span>
          )}
        </p>
        <p className="truncate text-xs text-gray-500">
          {order.pickupAddress}
          {(order.purchaseRequestedCans ?? 0) > 0 && ` · 신유 ${order.purchaseRequestedCans}캔`}
        </p>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          data-testid={`dealer-active-call-${order.orderId}`}
          className="shrink-0 rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          라이더에게 전화
        </a>
      )}
    </li>
  );
}

/**
 * [18 R5] 라이더별 포인트 지급 한도 배분 입력(PER_RIDER 모드 전용).
 * 비우면 배분 해제(null) — PER_RIDER에서는 0으로 취급돼 그 라이더는 POINT 지급을 할 수 없다.
 * 저장은 dealer-rider-limit-set Edge(소속 검증 후 service_role RPC)만 통과한다 —
 * rider_profiles.credit_limit은 guard_rider_verify가 직접 수정을 되돌린다(18 R9).
 */
function RiderLimitField({
  rider,
  onSave,
}: {
  rider: DealerRiderRow;
  onSave: (limit: number | null) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [value, setValue] = useState(rider.creditLimit == null ? "" : String(rider.creditLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed != null && (!Number.isInteger(parsed) || parsed < 0);
  const dirty = (rider.creditLimit ?? null) !== parsed;

  async function handleSave() {
    if (invalid) {
      setError("0 이상의 정수를 입력해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await onSave(parsed);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "저장에 실패했어요.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid={`rider-limit-field-${rider.id}`}>
      <label className="text-xs text-gray-500" htmlFor={`rider-limit-${rider.id}`}>
        지급 한도
      </label>
      <TextInput
        id={`rider-limit-${rider.id}`}
        data-testid={`rider-limit-input-${rider.id}`}
        inputMode="numeric"
        placeholder="미배분"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="w-28 tabular-nums"
      />
      <span className="text-xs text-gray-500 tabular-nums">P · 사용 {rider.creditUsed.toLocaleString()}P</span>
      <Button size="sm" data-testid={`rider-limit-save-${rider.id}`} disabled={busy || invalid || !dirty} onClick={handleSave}>
        {busy ? "저장 중…" : "저장"}
      </Button>
      {saved && !dirty && <span className="text-xs text-primary">저장됨</span>}
      {error && <span className="text-xs text-status-danger">{error}</span>}
    </div>
  );
}
