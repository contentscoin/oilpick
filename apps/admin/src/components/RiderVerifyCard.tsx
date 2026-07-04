import { useEffect, useState } from "react";
import type { AdminRiderRow } from "../hooks/useUsersAdmin";
import { createRiderDocSignedUrl } from "../hooks/useUsersAdmin";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { RiderVerifyOutput } from "@oilpick/core";

const VERIFY_STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
};

/**
 * 03-frontend.md apps/admin "/users": "rider PENDING 큐: 서류 이미지 뷰어 + 승인/반려(rider-verify)".
 * rider-docs 버킷이 private이므로 서명 URL로 문서 이미지를 렌더한다(apps/rider AuthPage가
 * doc_*_url에 저장하는 값은 Storage 경로 — 04-tasks.md 질문 목록 "order-photos 비공개 버킷" 항목과
 * 동일한 종류의 계약).
 */
export function RiderVerifyCard({ rider, onProcessed }: { rider: AdminRiderRow; onProcessed: () => void }) {
  const [docUrls, setDocUrls] = useState<Record<string, string | null>>({});
  const [rejectReason, setRejectReason] = useState("");
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

  async function handleDecision(decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !rejectReason.trim()) {
      setError("반려 사유를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invokeEdgeFunction<RiderVerifyOutput>("rider-verify", {
      riderId: rider.id,
      decision,
      ...(decision === "REJECTED" ? { rejectReason: rejectReason.trim() } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onProcessed();
  }

  return (
    <div className="rounded-card bg-white p-5 shadow-sm" data-testid={`rider-card-${rider.id}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-zinc-900">
            {rider.displayName} <span className="text-sm font-normal text-zinc-400">{rider.phone}</span>
          </p>
          <p className="text-sm text-zinc-500">
            사업자번호 {rider.bizNumber} · 차량번호 {rider.vehicleNumber}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            rider.verifyStatus === "APPROVED"
              ? "bg-primary-light text-primary"
              : rider.verifyStatus === "REJECTED"
                ? "bg-status-danger/10 text-status-danger"
                : "bg-accent-light text-accent"
          }`}
        >
          {VERIFY_STATUS_LABEL[rider.verifyStatus]}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-3">
        <DocThumb label="사업자등록증" url={docUrls.biz} />
        <DocThumb label="차량 사진" url={docUrls.vehicle} />
        {rider.docPermitUrl && <DocThumb label="폐기물 허가증" url={docUrls.permit} />}
      </div>

      {rider.verifyStatus === "REJECTED" && rider.rejectReason && (
        <p className="mb-3 text-sm text-status-danger">반려 사유: {rider.rejectReason}</p>
      )}

      {rider.verifyStatus === "PENDING" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="반려 사유(반려 시 필수)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-primary"
            data-testid={`reject-reason-${rider.id}`}
          />
          {error && <p className="text-sm font-medium text-status-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDecision("APPROVED")}
              className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60"
              data-testid={`approve-rider-${rider.id}`}
            >
              승인
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleDecision("REJECTED")}
              className="h-10 flex-1 rounded-lg bg-status-danger text-sm font-semibold text-white disabled:opacity-60"
              data-testid={`reject-rider-${rider.id}`}
            >
              반려
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocThumb({ label, url }: { label: string; url: string | null | undefined }) {
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="block w-28 rounded-xl border border-zinc-100 p-1 text-center"
    >
      {url ? (
        <img src={url} alt={label} className="h-20 w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400">
          없음
        </div>
      )}
      <p className="mt-1 truncate text-xs text-zinc-500">{label}</p>
    </a>
  );
}
