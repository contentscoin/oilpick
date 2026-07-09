import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAdminDepots, useDepotMutations, type AdminDepotRow } from "../hooks/useDepotsAdmin";

/**
 * 03-frontend.md apps/admin "/depots": "CRUD + QR 인쇄 뷰(qr_secret을 QR 이미지로)".
 * [07 F13] 집하장 일몰 — 집하장/QR 배송(구모델)이 신모델에서 소멸(07 §0). 라우트·네비는 제거됐고
 * (App.tsx/AdminShell), 이 화면은 파일·테이블·QR 시크릿 보존을 위해 남겨두되 **신규 등록은 차단**한다.
 * 기존(레거시) 집하장 목록 조회·활성/비활성 토글·QR 재열람만 허용.
 */
export function DepotsPage() {
  const { data: depots, isLoading } = useAdminDepots();
  const { updateDepot } = useDepotMutations();
  const [printDepot, setPrintDepot] = useState<AdminDepotRow | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">집하장 (레거시)</h1>
        <p className="text-sm text-gray-500">
          집하장·QR 배송은 신모델 피벗(07)으로 종료됐어요. 신규 등록은 불가하며, 기존 집하장 조회만 가능해요.
        </p>
      </div>

      <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" data-testid="depot-sunset-notice">
        신규 집하장 등록은 중단됐어요 (07 F13 레거시 일몰). 기존 데이터·QR 시크릿은 보존됩니다.
      </div>

      <div className="rounded-card bg-white p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">등록된 집하장</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : depots && depots.length > 0 ? (
          <div className="flex flex-col gap-3" data-testid="depot-list">
            {depots.map((depot) => (
              <div
                key={depot.id}
                className="flex flex-col gap-2 rounded-card border border-gray-100 p-4 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`depot-row-${depot.id}`}
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {depot.name}{" "}
                    {!depot.isActive && (
                      <span className="ml-1 rounded-pill bg-gray-100 px-2 py-0.5 text-xs text-gray-500">비활성</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{depot.address}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDepot(depot.id, { isActive: !depot.isActive })}
                    className="rounded-button border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    data-testid={`depot-toggle-${depot.id}`}
                  >
                    {depot.isActive ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintDepot(depot)}
                    className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-card"
                    data-testid={`depot-qr-${depot.id}`}
                  >
                    QR 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">등록된 집하장이 없어요.</p>
        )}
      </div>

      {printDepot && <DepotQrModal depot={printDepot} onClose={() => setPrintDepot(null)} />}
    </div>
  );
}

// [07 F13] NewDepotForm 제거 — 신규 집하장 등록 차단(집하장 소멸). useDepotMutations.createDepot도
// 미사용화(훅은 updateDepot 활성/비활성 토글 용도로 유지 — 레거시 depot 관리).

function DepotQrModal({ depot, onClose }: { depot: AdminDepotRow; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, depot.qrSecret, { width: 240, margin: 1 }).catch(() => {
        // 캔버스 렌더 실패는 인쇄 화면 표시만 막을 뿐 핵심 기능(QR 값 자체)에 영향 없음.
      });
    }
  }, [depot.qrSecret]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex flex-col items-center gap-4 rounded-hero bg-white p-8 shadow-raised"
        onClick={(e) => e.stopPropagation()}
        data-testid="depot-qr-modal"
      >
        <h2 className="text-lg font-bold text-gray-900">{depot.name}</h2>
        <p className="text-sm text-gray-500">{depot.address}</p>
        <canvas ref={canvasRef} data-testid="depot-qr-canvas" />
        <p className="max-w-xs break-all text-center text-xs text-gray-400">{depot.qrSecret}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card"
        >
          인쇄
        </button>
      </div>
    </div>
  );
}
