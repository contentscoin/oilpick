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
import { estimateCash, formatKg, formatKrw, type OrderStatus } from "@oilpick/core";
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

      {run.status === "ACCEPTED" && <AcceptedPanel orderId={run.id} pickupAddress={run.pickupAddress} />}
      {run.status === "ARRIVED" && (
        <ArrivedPanel
          orderId={run.id}
          measuredKg={run.measuredKg}
          finalKg={run.finalKg}
          snapshotPricePerKg={run.snapshotPricePerKg}
        />
      )}
      {run.status === "DISPUTED" && (
        <DisputedPanel orderId={run.id} measuredKg={run.measuredKg} photoUrls={run.photoUrls} />
      )}
      {run.status === "COMPLETED" && (
        <CompletedPanel cashPaidAmount={run.cashPaidAmount} finalKg={run.finalKg} />
      )}
      {/* 레거시 전용: 신모델은 CONFIRM_MEASURE가 COMPLETED로 직행해 PICKED_UP에 도달하지 않는다.
          프로덕션 잔존분(구모델 PICKED_UP)만 이 QR 배송 경로를 탄다(07 F6-②). */}
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
  ARRIVED: { title: "현장에서 계량해주세요", hint: "무게를 재고 현금을 지급한 뒤 사장님 확인을 받아요." },
  DISPUTED: { title: "사장님이 이의신청했어요", hint: "관리자 중재 결과를 기다리는 중이에요." },
  COMPLETED: { title: "수거를 완료했어요", hint: "현금 지급이 확인됐어요." },
  // 레거시 전용(구모델 PICKED_UP 잔존분).
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
function AcceptedPanel({ orderId, pickupAddress }: { orderId: string; pickupAddress: string }) {
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
      <MapView apiKey={KAKAO_KEY} center={{ lat: 37.5509, lng: 126.8225 }} pickupLabel={pickupAddress} />
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

/**
 * R5 ARRIVED: 07 F6-① 현금 매입 전환.
 * - 중재 완료(finalKg not null): 재제출 불가 — 중재 확정 무게·지급 현금 안내(제출 폼 숨김).
 * - 계량 제출 후(measuredKg not null): "현금 지급 후 사장님 확인 요청" 대기 배너.
 * - 그 외: kg 입력 + 사진(필수) + 예상 지급 현금 + [계량 제출 → 사장님 확인 요청].
 */
function ArrivedPanel({
  orderId,
  measuredKg,
  finalKg,
  snapshotPricePerKg,
}: {
  orderId: string;
  measuredKg: number | null;
  finalKg: number | null;
  snapshotPricePerKg: number;
}) {
  const [kg, setKg] = useState("");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 07 §1-3: 중재로 kg가 확정된(final_kg) 주문은 SUBMIT_MEASURE 재제출이 서버에서 거부된다.
  // 폼을 숨기고 확정 무게 + 지급할 현금 + 사장님 수령 확인 대기를 안내한다.
  if (finalKg != null) {
    return (
      <Card
        testId="run-arbitration-complete"
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
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.primary.dark }}>
          중재 확정 무게 {formatKg(finalKg)}
        </p>
        <p style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
          사장님께 현금 {formatKrw(estimateCash(finalKg, snapshotPricePerKg))}을 지급한 뒤 앱에서 수령 확인을 받아주세요.
        </p>
      </Card>
    );
  }

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
          제출한 계량 {formatKg(measuredKg)} · 사장님께 현금{" "}
          {formatKrw(estimateCash(measuredKg, snapshotPricePerKg))}을 지급하고 앱에서 수령 확인을 요청하세요.
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

  const cashPayout = kg ? estimateCash(Number(kg), snapshotPricePerKg) : 0;
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

        {/* 07 F6-①: 점주에게 지급할 현금(원화). 앰버(accent) 강조 배너. */}
        {showEstimate && (
          <div
            data-testid="run-cash-payout"
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
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>점주에게 지급할 현금</span>
            <span
              className="oilpick-tabular-nums"
              style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.DEFAULT }}
            >
              {formatKrw(cashPayout)}
            </span>
          </div>
        )}
        {showEstimate && (
          <p style={{ margin: 0, fontSize: 12, color: colors.status.wait, textAlign: "right" }}>
            현장 계량 기준으로 확정 · 점주에게 직접 지급
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
        계량 제출 → 사장님 확인 요청
      </BigButton>
    </form>
  );
}

/**
 * DISPUTED 안내 패널(07 F6-③). 사장님이 계량에 이의를 제기해 관리자 중재를 기다리는 상태.
 * 예전엔 이 상태가 진행중 목록에서 빠져 라이더가 빈 화면 + 수수께끼 409에 갇혔다.
 * 제출한 계량/사진 요약을 함께 보여 라이더가 맥락을 잃지 않게 한다. 중재가 끝나면(RESOLVE_DISPUTE
 * → ARRIVED 복귀) ArrivedPanel의 "중재 확정" 패널로 자연 전환된다.
 */
function DisputedPanel({
  orderId,
  measuredKg,
  photoUrls,
}: {
  orderId: string;
  measuredKg: number | null;
  photoUrls: string[];
}) {
  const navigate = useNavigate();
  return (
    <Card testId="run-disputed-panel" style={{ gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: gray[900] }}>사장님이 계량에 이의신청했어요</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: colors.status.wait }}>
          관리자가 중재 중이에요. 확정 무게가 정해지면 알림으로 알려드릴게요. 아직 현금은 지급하지 마세요.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingTop: 12,
          borderTop: `1px solid ${surface.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: colors.status.wait }}>제출한 계량</span>
          <span className="oilpick-tabular-nums" style={{ fontWeight: 600, color: gray[900] }}>
            {measuredKg != null ? formatKg(measuredKg) : "-"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: colors.status.wait }}>첨부 사진</span>
          <span className="oilpick-tabular-nums" style={{ fontWeight: 600, color: gray[900] }}>
            {photoUrls.length}장
          </span>
        </div>
      </div>
      {/* 07 F12 ③: 현금 지급 후 분쟁("사장님이 확인 안 해줘요" 등)은 상태머신 밖 CS(CASH_DISPUTE)로.
          이 주문을 프리셋해 고객센터 문의를 바로 연다(07 §1-3). */}
      <button
        type="button"
        data-testid="disputed-cs-entry"
        onClick={() => navigate(`/support?category=CASH_DISPUTE&orderId=${orderId}`)}
        style={{
          minHeight: 44,
          borderRadius: radius.button,
          border: `1.5px solid ${colors.primary.DEFAULT}`,
          background: "none",
          color: colors.primary.DEFAULT,
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        현금 지급 문제로 문의하기
      </button>
    </Card>
  );
}

/**
 * 완료 요약 패널(07 F6-④). CONFIRM_MEASURE/FORCE_COMPLETE로 COMPLETED에 도달한 직후,
 * 현장 지급 현금(cash_paid_amount)을 요약하고 콜 홈으로 복귀시킨다. 오래된 완료분은
 * useActiveRun이 걸러내므로(창 경과) 이 패널은 "완료 직후"에만 노출된다.
 */
function CompletedPanel({ cashPaidAmount, finalKg }: { cashPaidAmount: number | null; finalKg: number | null }) {
  const navigate = useNavigate();
  return (
    <Card
      testId="run-completed-panel"
      style={{ alignItems: "center", textAlign: "center", gap: 10, backgroundColor: colors.primary.light, borderColor: colors.primary.light }}
    >
      <span
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: "50%",
          backgroundColor: colors.primary.DEFAULT,
          color: "#fff",
        }}
      >
        <CheckMarkIcon />
      </span>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: colors.primary.dark }}>수거 완료</p>
      <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 15, color: gray[900] }}>
        현금 {formatKrw(cashPaidAmount ?? 0)} 지급
        {finalKg != null ? ` · ${formatKg(finalKg)}` : ""}
      </p>
      <BigButton data-testid="completed-go-home" onClick={() => navigate("/")}>
        콜 홈으로
      </BigButton>
    </Card>
  );
}

/**
 * 레거시 R6 PICKED_UP: 집하장 안내 + depotId/qrSecret 수동 입력/QR 스캔 → DELIVER.
 * 07 F6-②: 신모델은 이 상태에 도달하지 않는다(CONFIRM_MEASURE가 COMPLETED로 직행).
 * 프로덕션에 남은 구모델 PICKED_UP 주문 완결을 위해 분기·QR 스캔 코드를 보존한다(삭제 금지).
 */
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

/** 완료 요약 체크 아이콘(흰색). */
function CheckMarkIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
