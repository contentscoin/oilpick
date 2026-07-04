import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAdminDepots, useDepotMutations, type AdminDepotRow } from "../hooks/useDepotsAdmin";

/** 03-frontend.md apps/admin "/depots": "CRUD + QR 인쇄 뷰(qr_secret을 QR 이미지로)". */
export function DepotsPage() {
  const { data: depots, isLoading } = useAdminDepots();
  const { createDepot, updateDepot } = useDepotMutations();
  const [printDepot, setPrintDepot] = useState<AdminDepotRow | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">집하장</h1>
        <p className="text-sm text-zinc-500">집하장을 등록하고 QR 코드를 인쇄해요.</p>
      </div>

      <NewDepotForm onCreate={createDepot} />

      <div className="rounded-card bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">등록된 집하장</h2>
        {isLoading ? (
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        ) : depots && depots.length > 0 ? (
          <div className="flex flex-col gap-3" data-testid="depot-list">
            {depots.map((depot) => (
              <div
                key={depot.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`depot-row-${depot.id}`}
              >
                <div>
                  <p className="font-semibold text-zinc-900">
                    {depot.name}{" "}
                    {!depot.isActive && (
                      <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">비활성</span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-500">{depot.address}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDepot(depot.id, { isActive: !depot.isActive })}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    data-testid={`depot-toggle-${depot.id}`}
                  >
                    {depot.isActive ? "비활성화" : "활성화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintDepot(depot)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
                    data-testid={`depot-qr-${depot.id}`}
                  >
                    QR 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">등록된 집하장이 없어요.</p>
        )}
      </div>

      {printDepot && <DepotQrModal depot={printDepot} onClose={() => setPrintDepot(null)} />}
    </div>
  );
}

function NewDepotForm({ onCreate }: { onCreate: (input: { name: string; address: string; lat: number; lng: number }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("37.5509");
  const [lng, setLng] = useState("126.8225");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!name.trim() || !address.trim() || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      setError("모든 값을 올바르게 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), address: address.trim(), lat: latNum, lng: lngNum });
      setName("");
      setAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "집하장 등록에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">새 집하장 등록</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
            data-testid="depot-name-input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">주소</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
            data-testid="depot-address-input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">위도</span>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">경도</span>
          <input
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-status-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60"
        data-testid="depot-create-submit"
      >
        {busy ? "등록 중..." : "집하장 등록"}
      </button>
    </form>
  );
}

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
        className="flex flex-col items-center gap-4 rounded-card bg-white p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="depot-qr-modal"
      >
        <h2 className="text-lg font-bold text-zinc-900">{depot.name}</h2>
        <p className="text-sm text-zinc-500">{depot.address}</p>
        <canvas ref={canvasRef} data-testid="depot-qr-canvas" />
        <p className="max-w-xs break-all text-center text-xs text-zinc-400">{depot.qrSecret}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          인쇄
        </button>
      </div>
    </div>
  );
}
