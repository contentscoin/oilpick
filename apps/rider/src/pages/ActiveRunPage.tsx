import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, EmptyState, MapView, PhotoUploader, colors, radius, type PhotoAsset } from "@oilpick/ui";
import { formatKg, formatPoint } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../hooks/useSession";
import { useActiveRun } from "../hooks/useActiveRun";
import { useRiderLocationPusher } from "../hooks/useRiderLocationPusher";

/**
 * R4~R6 "/active" 운행 단일 화면. 03-frontend.md apps/rider 표:
 * "status 분기. ACCEPTED: 지도+내비 딥링크+[도착]. ARRIVED: 계량 입력(kg)+PhotoUploader(필수)+
 * [계량 제출]→'사장님 확인 대기' 배너(Realtime로 PICKED_UP 감지). PICKED_UP: 집하장 안내+QR
 * 스캐너→DELIVER 호출. 운행 중 15초 간격 rider-location 호출".
 *
 * QR 스캐너는 @capacitor-community/barcode-scanner가 최종형태이지만 Capacitor는 T12에서
 * 추가된다(태스크 지시사항, 04-tasks.md 질문 목록에 동일 패턴 기록됨 — PhotoUploader/MapView와
 * 동일). 지금은 depotId+qrSecret 수동 텍스트 입력 폴백 UI로 구현한다.
 */
export function ActiveRunPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const riderId = session?.user.id;
  const { data: run, isLoading } = useActiveRun(riderId);

  useRiderLocationPusher(Boolean(run));

  if (isLoading) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <div data-testid="active-run-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: "#f4f4f5" }} />
      </main>
    );
  }

  if (!run) {
    return (
      <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <EmptyState
          title="진행중인 운행이 없어요"
          description="콜 홈에서 새 콜을 수락해보세요."
          action={
            <BigButton data-testid="active-run-go-home" onClick={() => navigate("/")}>
              콜 홈으로
            </BigButton>
          }
        />
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "8px 0 0" }}>운행 중</h1>
      <p data-testid="active-run-address" style={{ margin: 0, fontSize: 15, color: colors.status.wait }}>
        {run.pickupAddress}
      </p>

      {run.status === "ACCEPTED" && <AcceptedPanel orderId={run.id} />}
      {run.status === "ARRIVED" && <ArrivedPanel orderId={run.id} measuredKg={run.measuredKg} snapshotPricePerKg={run.snapshotPricePerKg} />}
      {run.status === "PICKED_UP" && <PickedUpPanel orderId={run.id} depotId={run.depotId} />}
    </main>
  );
}

/** R4 ACCEPTED: 지도+내비 딥링크+[도착]. */
function AcceptedPanel({ orderId }: { orderId: string }) {
  const [arriving, setArriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArrive() {
    setError(null);
    setArriving(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId,
      action: "ARRIVE",
      payload: {},
    });
    setArriving(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <section data-testid="run-accepted-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MapView apiKey={KAKAO_KEY} center={{ lat: 37.5509, lng: 126.8225 }} />
      <a
        href="kakaomap://route"
        data-testid="navigate-deeplink"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 48,
          borderRadius: radius.button,
          border: `1px solid ${colors.primary.DEFAULT}`,
          color: colors.primary.DEFAULT,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        길찾기 앱으로 이동
      </a>
      {error && (
        <p role="alert" data-testid="run-action-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}
      <BigButton data-testid="arrive-button" loading={arriving} onClick={handleArrive}>
        도착
      </BigButton>
    </section>
  );
}

/** R5 ARRIVED: 계량 입력(kg)+PhotoUploader(필수)+[계량 제출]. measuredKg 있으면 확인 대기 배너. */
function ArrivedPanel({
  orderId,
  measuredKg,
  snapshotPricePerKg,
}: {
  orderId: string;
  measuredKg: number | null;
  snapshotPricePerKg: number;
}) {
  const [kg, setKg] = useState("");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (measuredKg != null) {
    return (
      <section
        data-testid="measure-wait-banner"
        style={{ borderRadius: radius.card, backgroundColor: colors.primary.light, padding: 20, textAlign: "center" }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>사장님 확인 대기</p>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: colors.status.wait }}>
          제출한 계량 {formatKg(measuredKg)} 값을 사장님이 확인하면 다음 단계로 넘어가요.
        </p>
      </section>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedKg = Number(kg);
    if (!kg || Number.isNaN(parsedKg) || parsedKg <= 0) {
      setError("계량값을 확인해주세요.");
      return;
    }
    if (photos.length === 0) {
      setError("현장 사진을 1장 이상 첨부해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const [i, photo] of photos.entries()) {
        const ext = photo.file instanceof File ? photo.file.name.split(".").pop() : "jpg";
        const path = `${orderId}/measure-${Date.now()}-${i}.${ext ?? "jpg"}`;
        const { error: uploadError } = await supabase.storage.from("order-photos").upload(path, photo.file, {
          upsert: true,
        });
        if (uploadError) throw uploadError;
        // order-photos는 비공개 버킷(01-db-schema.sql "Storage 버킷: order-photos (관련자 read /
        // rider write)")이라 getPublicUrl은 인증 헤더 없이 <img src>가 열 수 없는 URL을 만든다.
        // 장기 서명 URL(1년)을 만들어 photo_urls에 저장 — 소비 측(user 앱 OrderDetailPage)이
        // 이미 photoUrls를 <img src>로 직접 사용하는 계약(mapRow/OrderDetail.photoUrls)과
        // 호환되면서도 실제로 열람 가능하게 하는 최소 변경.
        const { data: signed, error: signError } = await supabase.storage
          .from("order-photos")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signError) throw signError;
        uploadedUrls.push(signed.signedUrl);
      }

      const result = await invokeEdgeFunction("order-transition", {
        orderId,
        action: "SUBMIT_MEASURE",
        payload: { measuredKg: parsedKg, photoUrls: uploadedUrls },
      });
      if (!result.ok) {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진 업로드 중 오류가 발생했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  const estimatedPoint = kg ? Math.round(Number(kg) * snapshotPricePerKg) : 0;

  return (
    <form data-testid="run-arrived-panel" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="measured-kg-input" style={{ fontSize: 14, fontWeight: 600 }}>
          계량 결과(kg)
        </label>
        <input
          id="measured-kg-input"
          data-testid="measured-kg-input"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          required
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          style={{ minHeight: 48, borderRadius: radius.button, border: "1px solid #e4e4e7", padding: "0 14px", fontSize: 16 }}
        />
        {kg && !Number.isNaN(Number(kg)) && (
          <p data-testid="run-estimated-point" style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
            예상 지급 포인트 {formatPoint(estimatedPoint)} (현장 계량 기준으로 확정됩니다)
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>현장 사진 (필수)</span>
        <PhotoUploader photos={photos} onChange={setPhotos} maxCount={3} />
      </div>

      {error && (
        <p role="alert" data-testid="run-action-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      <BigButton type="submit" data-testid="submit-measure-button" loading={submitting}>
        계량 제출
      </BigButton>
    </form>
  );
}

/** R6 PICKED_UP: 집하장 안내 + depotId/qrSecret 수동 입력 폴백 UI → DELIVER. */
function PickedUpPanel({ orderId, depotId }: { orderId: string; depotId: string | null }) {
  const [inputDepotId, setInputDepotId] = useState(depotId ?? "");
  const [qrSecret, setQrSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeliver(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!inputDepotId.trim() || !qrSecret.trim()) {
      setError("집하장 ID와 QR 값을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId,
      action: "DELIVER",
      payload: { depotId: inputDepotId.trim(), qrSecret: qrSecret.trim() },
    });
    setSubmitting(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <form data-testid="run-picked-up-panel" onSubmit={handleDeliver} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ borderRadius: radius.card, backgroundColor: "#fafafa", padding: 16 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>지정 집하장으로 이동해주세요.</p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: colors.status.wait }}>
          집하장 QR 코드를 스캔하는 대신, 개발 모드에서는 집하장 ID와 QR 값을 직접 입력할 수 있어요
          (04-tasks.md 질문 목록 — QR 스캐너는 T12에서 Capacitor 도입 후 교체 예정).
        </p>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="depot-id-input" style={{ fontSize: 14, fontWeight: 600 }}>
          집하장 ID
        </label>
        <input
          id="depot-id-input"
          data-testid="depot-id-input"
          type="text"
          required
          value={inputDepotId}
          onChange={(e) => setInputDepotId(e.target.value)}
          style={{ minHeight: 48, borderRadius: radius.button, border: "1px solid #e4e4e7", padding: "0 14px", fontSize: 16 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="qr-secret-input" style={{ fontSize: 14, fontWeight: 600 }}>
          QR 값(qrSecret)
        </label>
        <input
          id="qr-secret-input"
          data-testid="qr-secret-input"
          type="text"
          required
          value={qrSecret}
          onChange={(e) => setQrSecret(e.target.value)}
          style={{ minHeight: 48, borderRadius: radius.button, border: "1px solid #e4e4e7", padding: "0 14px", fontSize: 16 }}
        />
      </div>

      {error && (
        <p role="alert" data-testid="run-action-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      <BigButton type="submit" data-testid="deliver-button" loading={submitting}>
        배송완료 처리
      </BigButton>
    </form>
  );
}
