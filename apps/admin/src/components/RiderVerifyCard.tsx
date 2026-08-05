import { useEffect, useState } from "react";
import type { AdminRiderRow } from "../hooks/useUsersAdmin";
import { createRiderDocSignedUrl } from "../hooks/useUsersAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { RiderVerifyOutput } from "@oilpick/core";

const VERIFY_STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  SUSPENDED: "정지됨",
};

type Decision = "APPROVED" | "REJECTED" | "SUSPENDED" | "REINSTATED";

/**
 * 03-frontend.md apps/admin "/users": "rider PENDING 큐: 서류 이미지 뷰어 + 승인/반려(rider-verify)".
 * rider-docs 버킷이 private이므로 서명 URL로 문서 이미지를 렌더한다(apps/rider AuthPage가
 * doc_*_url에 저장하는 값은 Storage 경로 — 04-tasks.md 질문 목록 "order-photos 비공개 버킷" 항목과
 * 동일한 종류의 계약).
 *
 * 07 F11: 신고증명서(doc_permit_url) 필수 뱃지 + 인계처(recycler_name/contact) 표시 +
 * APPROVED 라이더 [정지](사유 필수)/SUSPENDED 라이더 [해제] 액션.
 */
export function RiderVerifyCard({
  rider,
  onProcessed,
  footer,
}: {
  rider: AdminRiderRow;
  onProcessed: () => void;
  /** 카드 하단 확장 슬롯(07 F10-② 쿠폰 잔액/조정 패널). */
  footer?: React.ReactNode;
}) {
  const [docUrls, setDocUrls] = useState<Record<string, string | null>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      const entries = await Promise.all(
        [
          ["biz", rider.docBizUrl] as const,
          ["vehicle", rider.docVehicleUrl] as const,
          ["permit", rider.docPermitUrl] as const,
        ].map(async ([key, path]) => {
          if (!path) return [key, null] as const;
          const url = await createRiderDocSignedUrl(path);
          return [key, url] as const;
        }),
      );
      if (cancelled) return;
      setDocUrls(Object.fromEntries(entries));
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [rider.docBizUrl, rider.docVehicleUrl, rider.docPermitUrl]);

  async function handleDecision(decision: Decision) {
    if ((decision === "REJECTED" || decision === "SUSPENDED") && !reason.trim()) {
      setError(decision === "REJECTED" ? "반려 사유를 입력해주세요." : "정지 사유를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invokeEdgeFunction<RiderVerifyOutput>("rider-verify", {
      riderId: rider.id,
      decision,
      ...(decision === "REJECTED" || decision === "SUSPENDED" ? { rejectReason: reason.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReason("");
    onProcessed();
  }

  const permitMissing = !rider.docPermitUrl;
  const recyclerMissing = !rider.recyclerName || !rider.recyclerContact;

  return (
    <div className="rounded-card bg-white p-5 shadow-card" data-testid={`rider-card-${rider.id}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">
            {rider.displayName} <span className="text-sm font-normal text-gray-500">{rider.phone}</span>
          </p>
          <p className="text-sm text-gray-500">
            사업자번호 {rider.bizNumber} · 차량번호 {rider.vehicleNumber}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-pill px-3 py-1 text-xs font-semibold ${
            rider.verifyStatus === "APPROVED"
              ? "bg-primary-light text-primary"
              : rider.verifyStatus === "REJECTED"
                ? "bg-status-danger/10 text-status-danger"
                : rider.verifyStatus === "SUSPENDED"
                  ? "bg-gray-200 text-gray-700"
                  : "bg-accent-light text-accent-deep"
          }`}
          data-testid={`rider-status-${rider.id}`}
        >
          {VERIFY_STATUS_LABEL[rider.verifyStatus]}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-3">
        <DocThumb label="사업자등록증" url={docUrls.biz} />
        <DocThumb label="차량 사진" url={docUrls.vehicle} />
        <DocThumb
          label="신고증명서"
          sublabel="폐기물처리(수집·운반) 신고증명서 · 필수"
          url={docUrls.permit}
          required
          missing={permitMissing}
        />
      </div>

      {/* 07 F11-③ 인계처(허가 재활용업체) — 승인 조건. */}
      <div
        className={`mb-3 rounded-card px-3 py-2 text-sm ${recyclerMissing ? "bg-status-danger/5 text-status-danger" : "bg-gray-50 text-gray-700"}`}
        data-testid={`rider-recycler-${rider.id}`}
      >
        <span className="font-medium">인계처(재활용업체)</span>{" "}
        {recyclerMissing ? (
          <span>미등록 — 승인 불가</span>
        ) : (
          <span>
            {rider.recyclerName} · {rider.recyclerContact}
          </span>
        )}
      </div>

      {rider.verifyStatus === "REJECTED" && rider.rejectReason && (
        <p className="mb-3 rounded-card bg-status-danger/5 px-3 py-2 text-sm text-status-danger">반려 사유: {rider.rejectReason}</p>
      )}
      {rider.verifyStatus === "SUSPENDED" && rider.rejectReason && (
        <p className="mb-3 rounded-card bg-gray-100 px-3 py-2 text-sm text-gray-700">정지 사유: {rider.rejectReason}</p>
      )}

      {rider.verifyStatus === "PENDING" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="반려 사유(반려 시 필수)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
            data-testid={`reject-reason-${rider.id}`}
          />
          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDecision("APPROVED")}
              className="h-10 flex-1 rounded-button bg-primary text-sm font-semibold text-white shadow-card disabled:opacity-60"
              data-testid={`approve-rider-${rider.id}`}
            >
              승인
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDecision("REJECTED")}
              className="h-10 flex-1 rounded-button border border-status-danger text-sm font-semibold text-status-danger hover:bg-status-danger/5 disabled:opacity-60"
              data-testid={`reject-rider-${rider.id}`}
            >
              반려
            </button>
          </div>
        </div>
      )}

      {rider.verifyStatus === "APPROVED" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="정지 사유(정지 시 필수)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
            data-testid={`suspend-reason-${rider.id}`}
          />
          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDecision("SUSPENDED")}
            className="h-10 rounded-button border border-status-danger text-sm font-semibold text-status-danger hover:bg-status-danger/5 disabled:opacity-60"
            data-testid={`suspend-rider-${rider.id}`}
          >
            정지
          </button>
        </div>
      )}

      {rider.verifyStatus === "SUSPENDED" && (
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDecision("REINSTATED")}
            className="h-10 rounded-button bg-primary text-sm font-semibold text-white shadow-card disabled:opacity-60"
            data-testid={`reinstate-rider-${rider.id}`}
          >
            정지 해제
          </button>
        </div>
      )}

      {footer}
    </div>
  );
}

function DocThumb({
  label,
  sublabel,
  url,
  required,
  missing,
}: {
  label: string;
  sublabel?: string;
  url: string | null | undefined;
  required?: boolean;
  missing?: boolean;
}) {
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={`block w-32 rounded-card border p-1 text-center transition-shadow hover:shadow-card ${
        required && missing ? "border-status-danger" : "border-gray-100"
      }`}
      title={sublabel ?? label}
    >
      {url ? (
        <img src={url} alt={label} className="h-20 w-full rounded-button object-cover" />
      ) : (
        <div
          className={`flex h-20 w-full items-center justify-center rounded-button text-xs ${
            required && missing ? "bg-status-danger/5 text-status-danger" : "bg-gray-100 text-gray-500"
          }`}
        >
          {required && missing ? "미제출" : "없음"}
        </div>
      )}
      <p className="mt-1 text-xs text-gray-500">
        {label}
        {required && <span className="ml-0.5 text-status-danger">*</span>}
      </p>
    </a>
  );
}
