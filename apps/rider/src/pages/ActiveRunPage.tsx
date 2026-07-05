import { type CSSProperties, type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BigButton,
  EmptyState,
  MapView,
  OrderTimeline,
  PhotoUploader,
  colors,
  elevation,
  gray,
  radius,
  surface,
  type PhotoAsset,
} from "@oilpick/ui";
import { formatKg, formatPoint, type OrderStatus } from "@oilpick/core";
import { KAKAO_KEY } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../hooks/useSession";
import { useActiveRun } from "../hooks/useActiveRun";
import { useRiderLocationPusher } from "../hooks/useRiderLocationPusher";
import { isScannerAvailable, scanQrCode } from "../lib/native/scanner";

/**
 * R4~R6 "/active" 운행 단일 화면. 03-frontend.md apps/rider 표:
 * "status 분기. ACCEPTED: 지도+내비 딥링크+[도착]. ARRIVED: 계량 입력(kg)+PhotoUploader(필수)+
 * [계량 제출]→'사장님 확인 대기' 배너(Realtime로 PICKED_UP 감지). PICKED_UP: 집하장 안내+QR
 * 스캐너→DELIVER 호출. 운행 중 15초 간격 rider-location 호출".
 *
 * QR 스캐너: T12에서 @capacitor-community/barcode-scanner를 연동했다(lib/native/scanner.ts).
 * 네이티브(iOS/Android)에서는 [QR 스캔] 버튼으로 카메라 스캔 → qrSecret 자동 입력하고,
 * 웹/개발 모드에서는 depotId+qrSecret 수동 텍스트 입력 폴백 UI를 그대로 사용한다
 * (scanQrCode가 웹에서 no-op). 두 경로 모두 최종적으로 DELIVER RPC를 호출한다.
 *
 * 디자인(05-design-upgrade.md): U7에서 확립한 언어(surface/elevation 토큰, 상태 헤드라인,
 * OrderTimeline)를 라이더 관점으로 끌어올린다. 헤드라인 카피는 공급자용이 아니라 라이더
 * 행동 유도형(RiderRunHeadline). 기능/로직/testid/상태분기/edge function 호출은 불변.
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
        <div data-testid="active-run-skeleton" style={{ height: 240, borderRadius: radius.card, backgroundColor: gray[100] }} />
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
      {/* 05-design-upgrade.md 상태 헤드라인 패턴을 라이더 관점 카피로. 주소는 헤드라인 카드 안에 묶어
          "어디로 가야 하는지"를 함께 안내한다. */}
      <RiderRunHeadline status={run.status} address={run.pickupAddress} />

      {/* 진행 맥락: U7과 동일한 세로 타임라인으로 라이더도 현재 단계를 본다. */}
      <OrderTimeline currentStatus={run.status} />

      {run.status === "ACCEPTED" && <AcceptedPanel orderId={run.id} />}
      {run.status === "ARRIVED" && <ArrivedPanel orderId={run.id} measuredKg={run.measuredKg} snapshotPricePerKg={run.snapshotPricePerKg} />}
      {run.status === "PICKED_UP" && <PickedUpPanel orderId={run.id} depotId={run.depotId} />}
    </main>
  );
}

/**
 * 라이더 관점 상태 헤드라인 — 05-design-upgrade.md StatusHeadline 패턴의 라이더 전용 변형.
 * 공급자용 StatusHeadline은 상태를 "알려주는" 카피("라이더가 배정됐어요")라 라이더 본인에게는
 * 부적절하므로, 여기서는 행동 유도형 카피(무엇을 해야 하는지)를 쓴다. packages/core 규칙 위반이
 * 아니다(앱 전용 프레젠테이션 컴포넌트). 큰 문장(gray-900 24px 800) + 보조설명 + 목적지 주소.
 */
const RIDER_HEADLINE: Partial<Record<OrderStatus, { title: string; hint: string }>> = {
  ACCEPTED: { title: "매장으로 이동해주세요", hint: "도착하면 도착 버튼을 눌러주세요." },
  ARRIVED: { title: "현장에서 계량해주세요", hint: "무게를 재고 사진을 올려주세요." },
  PICKED_UP: { title: "집하장으로 이동해주세요", hint: "QR로 배송을 완료하세요." },
};

function RiderRunHeadline({ status, address }: { status: OrderStatus; address: string }) {
  const copy = RIDER_HEADLINE[status] ?? { title: "운행 중", hint: "" };
  return (
    <section
      data-testid="rider-run-headline"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 20,
        borderRadius: radius.hero,
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
        boxShadow: elevation.card,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.01em", color: gray[900] }}>
          {copy.title}
        </h1>
        {copy.hint && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: colors.status.wait }}>{copy.hint}</p>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          paddingTop: 12,
          borderTop: `1px solid ${surface.border}`,
        }}
      >
        <PinIcon />
        <p data-testid="active-run-address" style={{ margin: 0, fontSize: 15, fontWeight: 600, color: gray[800], flex: 1, minWidth: 0 }}>
          {address}
        </p>
      </div>
    </section>
  );
}

/** 흰 카드 공용 래퍼 — U7 톤(surface.card + surface.border + elevation.card). */
function Card({ children, testId, style }: { children: ReactNode; testId?: string; style?: CSSProperties }) {
  return (
    <section
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
        borderRadius: radius.card,
        backgroundColor: surface.card,
        border: `1px solid ${surface.border}`,
        boxShadow: elevation.card,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/** 입력 필드 공용 스타일 — surface.border 사용(하드코딩 제거). */
const inputStyle: CSSProperties = {
  minHeight: 48,
  borderRadius: radius.button,
  border: `1px solid ${surface.border}`,
  padding: "0 14px",
  fontSize: 16,
  backgroundColor: surface.card,
};

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
    <div data-testid="run-accepted-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MapView apiKey={KAKAO_KEY} center={{ lat: 37.5509, lng: 126.8225 }} />
      <a
        href="kakaomap://route"
        data-testid="navigate-deeplink"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
          minHeight: 48,
          borderRadius: radius.button,
          border: `1px solid ${colors.primary.DEFAULT}`,
          backgroundColor: surface.card,
          boxShadow: elevation.card,
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
    </div>
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
      <Card
        testId="measure-wait-banner"
        style={{ alignItems: "center", textAlign: "center", gap: 8, backgroundColor: colors.primary.light, borderColor: colors.primary.light }}
      >
        <span
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            backgroundColor: "#fff",
            color: colors.primary.DEFAULT,
          }}
        >
          <ClockIcon />
        </span>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>사장님 확인 대기</p>
        <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
          제출한 계량 {formatKg(measuredKg)} 값을 사장님이 확인하면 다음 단계로 넘어가요.
        </p>
      </Card>
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
  const showEstimate = Boolean(kg) && !Number.isNaN(Number(kg));

  return (
    <form data-testid="run-arrived-panel" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="measured-kg-input" style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>
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
            style={inputStyle}
          />
        </div>

        {/* 예상 지급 포인트: 앰버(accent) 강조 배너. */}
        {showEstimate && (
          <div
            data-testid="run-estimated-point"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 14px",
              borderRadius: radius.button,
              backgroundColor: colors.accent.light,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>예상 지급 포인트</span>
            <span
              className="oilpick-tabular-nums"
              style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.DEFAULT }}
            >
              {formatPoint(estimatedPoint)}
            </span>
          </div>
        )}
        {showEstimate && (
          <p style={{ margin: 0, fontSize: 12, color: colors.status.wait, textAlign: "right" }}>
            현장 계량 기준으로 확정됩니다
          </p>
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>현장 사진 (필수)</span>
        <PhotoUploader photos={photos} onChange={setPhotos} maxCount={3} />
      </Card>

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
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // R6 QR 스캔(네이티브 전용). 스캔 성공 시 qrSecret 필드를 채운다. 웹에서는 버튼이 노출되지 않음.
  async function handleScan() {
    setError(null);
    setScanning(true);
    try {
      const content = await scanQrCode();
      if (content) setQrSecret(content);
    } catch {
      setError("QR 스캔에 실패했어요. 카메라 권한을 확인하거나 값을 직접 입력해주세요.");
    } finally {
      setScanning(false);
    }
  }

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
      <Card style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: gray[900] }}>지정 집하장으로 이동해주세요.</p>
        <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
          {isScannerAvailable()
            ? "집하장 QR 코드를 스캔해 배송을 완료하세요. 필요하면 값을 직접 입력할 수도 있어요."
            : "집하장 QR 코드를 스캔하는 대신, 웹/개발 모드에서는 집하장 ID와 QR 값을 직접 입력할 수 있어요."}
        </p>
      </Card>

      {isScannerAvailable() && (
        <BigButton
          type="button"
          variant="secondary"
          data-testid="scan-qr-button"
          loading={scanning}
          onClick={() => void handleScan()}
        >
          QR 스캔
        </BigButton>
      )}

      <Card style={{ gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="depot-id-input" style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>
            집하장 ID
          </label>
          <input
            id="depot-id-input"
            data-testid="depot-id-input"
            type="text"
            required
            value={inputDepotId}
            onChange={(e) => setInputDepotId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="qr-secret-input" style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>
            QR 값(qrSecret)
          </label>
          <input
            id="qr-secret-input"
            data-testid="qr-secret-input"
            type="text"
            required
            value={qrSecret}
            onChange={(e) => setQrSecret(e.target.value)}
            style={inputStyle}
          />
        </div>
      </Card>

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

/** 목적지 주소 앞 핀 아이콘. */
function PinIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
      <path
        d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21Z"
        stroke={colors.primary.DEFAULT}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <circle cx={12} cy={10.3} r={2.3} stroke={colors.primary.DEFAULT} strokeWidth={1.7} />
    </svg>
  );
}

/** 확인 대기 배너 시계 아이콘. */
function ClockIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={8.5} stroke="currentColor" strokeWidth={1.7} />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
