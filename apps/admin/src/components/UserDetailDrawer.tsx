import { useState } from "react";
import { ORDER_STATUS_LABEL, formatKg, formatKrw, formatPoint, type UserUpdateInput } from "@oilpick/core";
import {
  useRiderCredits,
  useUserMutations,
  useUserRecentOrders,
  type AdminRiderRow,
  type AdminSupplierRow,
} from "../hooks/useUsersAdmin";
import { Badge, Button, DescriptionList, Drawer, Field, TextInput } from "./ui";

/**
 * [19 T4] 회원 상세 드로어 — 공급업체·라이더 공통. docs/spec/19-admin-console.md §1 T4.
 *
 * 기본정보 + 잔액/한도 + 최근 주문 10건 + 정보수정(user-update Edge).
 * 정보수정이 다루는 범위는 **연락 가능성·식별 정보**뿐이다. 승인상태·소속·한도는 각각
 * rider-verify / dealer-assign / dealer-rider-limit-set 전용이라 여기 폼에 두지 않는다
 * (권한 경로를 섞으면 감사 추적이 무너진다 — 19 §2).
 */
export function UserDetailDrawer({
  supplier,
  rider,
  pointBalance,
  couponBalance,
  onClose,
}: {
  supplier?: AdminSupplierRow;
  rider?: AdminRiderRow;
  pointBalance?: number;
  couponBalance?: number;
  onClose: () => void;
}) {
  const role: "supplier" | "rider" = supplier ? "supplier" : "rider";
  const userId = supplier?.id ?? rider?.id;
  const title = supplier ? supplier.storeName : (rider?.displayName ?? "회원");
  const { data: orders } = useUserRecentOrders(userId, role);
  const { data: credits } = useRiderCredits();
  const credit = rider ? credits?.get(rider.id) : undefined;

  const completedKg = (orders ?? [])
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + (o.finalKg ?? 0), 0);

  return (
    <Drawer title={title} onClose={onClose} data-testid="user-detail-drawer">
      <section className="rounded-card bg-white p-4 shadow-card">
        {supplier ? (
          <DescriptionList
            data-testid="user-detail-info"
            items={[
              { label: "상호", value: supplier.storeName },
              { label: "담당자", value: supplier.displayName },
              { label: "사업자번호", value: supplier.bizNumber },
              { label: "전화", value: supplier.phone },
              { label: "가입일", value: new Date(supplier.createdAt).toLocaleDateString("ko-KR") },
              {
                label: "포인트 잔액",
                value: (
                  <span className="tabular-nums text-accent-deep">
                    {pointBalance !== undefined ? formatPoint(pointBalance) : "-"}
                  </span>
                ),
              },
              { label: "주소", value: supplier.address, full: true },
            ]}
          />
        ) : rider ? (
          <DescriptionList
            data-testid="user-detail-info"
            items={[
              { label: "이름", value: rider.displayName },
              { label: "전화", value: rider.phone },
              { label: "차량번호", value: rider.vehicleNumber },
              { label: "사업자번호", value: rider.bizNumber },
              {
                label: "승인 상태",
                value: (
                  <Badge tone={rider.verifyStatus === "APPROVED" ? "primary" : rider.verifyStatus === "PENDING" ? "warning" : "danger"}>
                    {rider.verifyStatus}
                  </Badge>
                ),
              },
              { label: "온라인", value: rider.isOnline ? "온라인" : "오프라인" },
              // [19 T4] 소속 좌상 — 회원 관리에서 조직 귀속이 안 보이던 누락 연결.
              { label: "소속 좌상", value: rider.dealerName ?? "미배정(본사 직속)" },
              {
                label: "지급 한도",
                value: credit
                  ? credit.isUnlimited
                    ? "무제한(한도 미등록)"
                    : `${(credit.limitAmount ?? 0).toLocaleString()}P · 사용 ${credit.used.toLocaleString()}P`
                  : rider.creditLimit != null
                    ? `${rider.creditLimit.toLocaleString()}P`
                    : "미배분",
              },
              {
                label: "쿠폰 잔액",
                value: couponBalance !== undefined ? `${couponBalance}장` : "-",
              },
              { label: "재활용업체", value: rider.recyclerName ?? "-" },
              { label: "재활용업체 연락처", value: rider.recyclerContact ?? "-" },
              { label: "가입일", value: new Date(rider.createdAt).toLocaleDateString("ko-KR"), full: true },
            ]}
          />
        ) : null}
      </section>

      <UserEditForm supplier={supplier} rider={rider} />

      <section className="rounded-card bg-white p-4 shadow-card">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-800">최근 주문</p>
          {completedKg > 0 && <p className="text-xs text-gray-500">완료분 누적 {formatKg(completedKg)}</p>}
        </div>
        {orders && orders.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="user-recent-orders">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 pb-2 text-sm last:border-0 last:pb-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge tone={o.status === "COMPLETED" ? "primary" : o.status === "CANCELLED" ? "neutral" : "warning"}>
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                  <span className="text-gray-600">{new Date(o.createdAt).toLocaleDateString("ko-KR")}</span>
                </span>
                <span className="tabular-nums text-gray-700">
                  {formatKg(o.finalKg ?? o.requestedKg)}
                  {o.cashPaidAmount !== null && (
                    <span className="ml-2 font-medium text-accent-deep">
                      {o.payoutMethod === "POINT" ? formatPoint(o.cashPaidAmount) : formatKrw(o.cashPaidAmount)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">주문 기록이 없어요.</p>
        )}
      </section>
    </Drawer>
  );
}

/**
 * 정보수정 폼 — 비운 항목은 보내지 않는다(부분 수정). 저장은 user-update Edge만 경유한다.
 * 재활용업체 두 항목은 "지움"이 유효한 조작이라 빈 문자열을 null로 보낸다(다른 항목과 다름).
 */
function UserEditForm({ supplier, rider }: { supplier?: AdminSupplierRow; rider?: AdminRiderRow }) {
  const { updateUser } = useUserMutations();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    displayName: supplier?.displayName ?? rider?.displayName ?? "",
    phone: supplier?.phone ?? rider?.phone ?? "",
    storeName: supplier?.storeName ?? "",
    bizNumber: supplier?.bizNumber ?? rider?.bizNumber ?? "",
    address: supplier?.address ?? "",
    vehicleNumber: rider?.vehicleNumber ?? "",
    recyclerName: rider?.recyclerName ?? "",
    recyclerContact: rider?.recyclerContact ?? "",
  }));

  const userId = supplier?.id ?? rider?.id;
  if (!userId) return null;

  function diffed(next: string, current: string | null | undefined): string | undefined {
    const trimmed = next.trim();
    if (!trimmed || trimmed === (current ?? "")) return undefined;
    return trimmed;
  }

  async function handleSave() {
    setError(null);
    setNotice(null);
    const input: UserUpdateInput = { userId: userId as string };
    const nameSource = supplier?.displayName ?? rider?.displayName;
    const phoneSource = supplier?.phone ?? rider?.phone;
    input.displayName = diffed(form.displayName, nameSource);
    input.phone = diffed(form.phone, phoneSource);
    if (supplier) {
      input.storeName = diffed(form.storeName, supplier.storeName);
      input.bizNumber = diffed(form.bizNumber, supplier.bizNumber);
      input.address = diffed(form.address, supplier.address);
    } else if (rider) {
      input.bizNumber = diffed(form.bizNumber, rider.bizNumber);
      input.vehicleNumber = diffed(form.vehicleNumber, rider.vehicleNumber);
      // 빈 문자열 = 지움(null). 값이 그대로면 보내지 않는다.
      const recyclerName = form.recyclerName.trim();
      if (recyclerName !== (rider.recyclerName ?? "")) input.recyclerName = recyclerName || null;
      const recyclerContact = form.recyclerContact.trim();
      if (recyclerContact !== (rider.recyclerContact ?? "")) input.recyclerContact = recyclerContact || null;
    }

    const hasChange = Object.entries(input).some(([k, v]) => k !== "userId" && v !== undefined);
    if (!hasChange) {
      setError("변경된 항목이 없어요.");
      return;
    }
    setBusy(true);
    const result = await updateUser(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice("회원 정보를 수정했어요.");
  }

  return (
    <section className="rounded-card bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">정보수정</p>
          <p className="mt-0.5 text-xs text-gray-500">
            승인 상태·소속 좌상·지급 한도는 각각 전용 화면에서만 바꿀 수 있어요.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen((v) => !v)} data-testid="user-edit-toggle">
          {open ? "닫기" : "수정"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={supplier ? "담당자" : "이름"}>
              <TextInput
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                data-testid="user-edit-display-name"
              />
            </Field>
            <Field label="전화">
              <TextInput
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="user-edit-phone"
              />
            </Field>
            {supplier && (
              <>
                <Field label="상호">
                  <TextInput
                    value={form.storeName}
                    onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                    data-testid="user-edit-store-name"
                  />
                </Field>
                <Field label="사업자번호">
                  <TextInput
                    value={form.bizNumber}
                    onChange={(e) => setForm((f) => ({ ...f, bizNumber: e.target.value }))}
                    data-testid="user-edit-biz-number"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="주소" hint="좌표(pickup_location)는 점주 앱의 주소검색으로만 갱신돼요.">
                    <TextInput
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      data-testid="user-edit-address"
                    />
                  </Field>
                </div>
              </>
            )}
            {rider && (
              <>
                <Field label="차량번호">
                  <TextInput
                    value={form.vehicleNumber}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                    data-testid="user-edit-vehicle-number"
                  />
                </Field>
                <Field label="사업자번호">
                  <TextInput
                    value={form.bizNumber}
                    onChange={(e) => setForm((f) => ({ ...f, bizNumber: e.target.value }))}
                    data-testid="user-edit-biz-number"
                  />
                </Field>
                <Field label="재활용업체" hint="비우면 지워져요.">
                  <TextInput
                    value={form.recyclerName}
                    onChange={(e) => setForm((f) => ({ ...f, recyclerName: e.target.value }))}
                    data-testid="user-edit-recycler-name"
                  />
                </Field>
                <Field label="재활용업체 연락처" hint="비우면 지워져요.">
                  <TextInput
                    value={form.recyclerContact}
                    onChange={(e) => setForm((f) => ({ ...f, recyclerContact: e.target.value }))}
                    data-testid="user-edit-recycler-contact"
                  />
                </Field>
              </>
            )}
          </div>
          {error && (
            <p className="text-sm font-medium text-status-danger" data-testid="user-edit-error">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm font-medium text-primary" data-testid="user-edit-notice">
              {notice}
            </p>
          )}
          <Button variant="primary" disabled={busy} onClick={handleSave} className="self-start" data-testid="user-edit-save">
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      )}
    </section>
  );
}
