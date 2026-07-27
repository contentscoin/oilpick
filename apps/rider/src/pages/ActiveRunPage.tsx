import { type CSSProperties, type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BigButton,
  EmptyState,
  MapView,
  OrderTimeline,
  PayoutMethodChip,
  PhotoUploader,
  QtyStepper,
  colors,
  elevation,
  gray,
  radius,
  surface,
  touchTarget,
  useToast,
  type PhotoAsset,
} from "@oilpick/ui";
import {
  PAYOUT_METHOD_LABEL,
  buildKakaoRouteUrl,
  buildKakaoWebRouteUrl,
  buildTmapRouteUrl,
  estimateCash,
  estimatePurchase,
  formatKg,
  formatKrw,
  formatPoint,
  humanizeSupabaseError,
  type LatLng,
  type OrderKind,
  type OrderStatus,
  type PayoutMethod,
  type PickupGeo,
  ORDER_STATUS_LABEL,
} from "@oilpick/core";
import { MAP_STYLE_URL } from "../lib/env";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../hooks/useSession";
import { useActiveRun, useActiveRunSummaries, type ActiveRunSummary } from "../hooks/useActiveRun";
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
  // [다중 콜] 활성 주문이 최대 3건이 될 수 있다. 어느 건을 보고 있는지는 화면 상태로 들고,
  // 미선택이면 가장 최근 건을 보여준다(단건일 때는 전환기가 아예 렌더되지 않아 기존과 동일).
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>(undefined);
  const { data: run, isLoading } = useActiveRun(riderId, selectedOrderId);
  const { data: summaries } = useActiveRunSummaries(riderId);

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
      {/* [다중 콜] 진행 중인 운행이 2건 이상일 때만 전환기를 띄운다. 단건이면 렌더되지 않아
          기존 화면과 동일하다. 이게 없으면 3건을 수락해도 한 건만 보여 나머지가 갇힌다. */}
      <RunSwitcher runs={summaries ?? []} currentId={run.id} onSelect={setSelectedOrderId} />

      {/* 05-design-upgrade.md 상태 헤드라인 패턴을 라이더 관점 카피로. 주소는 헤드라인 카드 안에 묶어
          "어디로 가야 하는지"를 함께 안내한다. */}
      <RiderRunHeadline status={run.status} address={run.pickupAddress} />

      {/* 진행 맥락: U7과 동일한 세로 타임라인으로 라이더도 현재 단계를 본다. */}
      <OrderTimeline currentStatus={run.status} />

      {run.status === "ACCEPTED" && (
        <AcceptedPanel
          orderId={run.id}
          pickupAddress={run.pickupAddress}
          pickupPoint={run.pickupLat != null && run.pickupLng != null ? { lat: run.pickupLat, lng: run.pickupLng } : null}
        />
      )}
      {run.status === "ARRIVED" && (
        <ArrivedPanel
          orderId={run.id}
          measuredKg={run.measuredKg}
          finalKg={run.finalKg}
          snapshotPricePerKg={run.snapshotPricePerKg}
          submittedPayoutMethod={run.payoutMethod}
          existingPhotoUrls={run.photoUrls}
          orderKind={run.orderKind}
          purchaseRequestedCans={run.purchaseRequestedCans}
          snapshotFreshCanPrice={run.snapshotFreshCanPrice}
        />
      )}
      {run.status === "DISPUTED" && (
        <DisputedPanel orderId={run.id} measuredKg={run.measuredKg} photoUrls={run.photoUrls} />
      )}
      {run.status === "COMPLETED" && (
        <CompletedPanel
          cashPaidAmount={run.cashPaidAmount}
          netAmount={run.netAmount}
          finalKg={run.finalKg}
          payoutMethod={run.payoutMethod}
        />
      )}
      {/* 레거시 전용: 신모델은 CONFIRM_MEASURE가 COMPLETED로 직행해 PICKED_UP에 도달하지 않는다.
          프로덕션 잔존분(구모델 PICKED_UP)만 이 QR 배송 경로를 탄다(07 F6-②). */}
      {run.status === "PICKED_UP" && <PickedUpPanel orderId={run.id} depotId={run.depotId} />}

      {/* 06 E8-④: 현장 소통용 [사장님께 전화] — user OrderDetailPage의 tel: CTA(라이더에게 전화)
          역방향. 이동/계량 단계에서만 노출하고, phone이 없으면(정책 미적용·미기입) 렌더하지 않는다. */}
      {(run.status === "ACCEPTED" || run.status === "ARRIVED") && run.supplierPhone && (
        <a
          href={`tel:${run.supplierPhone}`}
          data-testid="call-supplier-button"
          aria-label={run.supplierName ? `${run.supplierName} 사장님께 전화` : "사장님께 전화"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            minHeight: touchTarget,
            padding: "14px 20px",
            borderRadius: radius.button,
            backgroundColor: colors.primary.DEFAULT,
            color: "#fff",
            fontSize: 17,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <PhoneCtaIcon />
          사장님께 전화
        </a>
      )}
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
  // 08 P2: 지급 수단(현금/포인트)은 계량 제출 시 라이더가 선택한다 — 수단 중립 카피.
  ARRIVED: { title: "현장에서 계량해주세요", hint: "무게를 재고 지급 수단을 선택한 뒤 사장님 확인을 받아요." },
  DISPUTED: { title: "사장님이 이의신청했어요", hint: "관리자 중재 결과를 기다리는 중이에요." },
  COMPLETED: { title: "수거를 완료했어요", hint: "지급 확인이 끝났어요." },
  // 레거시 전용(구모델 PICKED_UP 잔존분).
  PICKED_UP: { title: "집하장으로 이동해주세요", hint: "QR로 배송을 완료하세요." },
};

/**
 * 진행 중 운행 전환기(다중 콜). 2건 이상일 때만 렌더한다.
 * 상태 라벨 + 주소 앞부분으로 어느 건인지 구분하고, 탭하면 해당 운행 화면으로 전환한다.
 */
function RunSwitcher({
  runs,
  currentId,
  onSelect,
}: {
  runs: ActiveRunSummary[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  if (runs.length < 2) return null;
  return (
    <section data-testid="run-switcher" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.status.wait }}>
        진행 중 {runs.length}건 — 탭해서 전환
      </p>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {runs.map((r) => {
          const active = r.id === currentId;
          return (
            <button
              key={r.id}
              type="button"
              data-testid={`run-switch-${r.id}`}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(r.id)}
              style={{
                flexShrink: 0,
                maxWidth: 200,
                textAlign: "left",
                padding: "8px 12px",
                borderRadius: radius.button,
                border: `1px solid ${active ? colors.primary.DEFAULT : surface.border}`,
                backgroundColor: active ? colors.primary.light : "#fff",
                color: active ? colors.primary.dark : gray[900],
                fontSize: 13,
                lineHeight: 1.35,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "block", fontWeight: 700 }}>{ORDER_STATUS_LABEL[r.status]}</span>
              <span style={{ display: "block", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.pickupAddress}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

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
function AcceptedPanel({
  orderId,
  pickupAddress,
  pickupPoint,
}: {
  orderId: string;
  pickupAddress: string;
  /** 수거지 실좌표(EWKB 파싱, 11 M9-a). null이면 지도는 프리뷰·내비는 주소 검색 폴백. */
  pickupPoint: LatLng | null;
}) {
  const [arriving, setArriving] = useState(false);
  // 06 E6: 도착 성공/실패 피드백은 전역 토스트로 통일(인라인 에러 텍스트 대체).
  const { showToast } = useToast();
  // 11 M9-a: 좌표가 있으면 카카오맵 앱 스킴에 목적지를 실어 턴바이턴이 바로 뜨게 한다.
  // 좌표가 없으면(레거시/파싱 실패) 주소 검색 웹 링크로 강등 — 죽은 딥링크 금지.
  const kakaoHref = pickupPoint
    ? buildKakaoRouteUrl(pickupPoint)
    : `https://map.kakao.com/link/search/${encodeURIComponent(pickupAddress)}`;

  async function handleArrive() {
    setArriving(true);
    const result = await invokeEdgeFunction("order-transition", {
      orderId,
      action: "ARRIVE",
      payload: {},
    });
    setArriving(false);
    if (result.ok) {
      showToast("도착을 알렸어요", { variant: "success" });
    } else {
      showToast(result.message, { variant: "error" });
    }
  }

  return (
    <div data-testid="run-accepted-panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MapView
        styleUrl={MAP_STYLE_URL}
        center={pickupPoint ?? { lat: 37.5509, lng: 126.8225 }}
        markers={pickupPoint ? [{ ...pickupPoint, label: pickupAddress }] : []}
        pickupLabel={pickupAddress}
      />
      <a
        href={kakaoHref}
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
        {pickupPoint ? "카카오맵으로 길안내" : "카카오맵에서 주소 검색"}
      </a>
      {pickupPoint && (
        <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 13 }}>
          <a
            href={buildTmapRouteUrl(pickupAddress, pickupPoint)}
            data-testid="navigate-tmap"
            style={{ color: gray[500], textDecoration: "none", fontWeight: 600 }}
          >
            TMap으로 안내
          </a>
          <a
            href={buildKakaoWebRouteUrl(pickupAddress, pickupPoint)}
            target="_blank"
            rel="noreferrer"
            data-testid="navigate-web-fallback"
            style={{ color: gray[500], textDecoration: "none", fontWeight: 600 }}
          >
            앱이 없다면 웹 길찾기
          </a>
        </div>
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
/**
 * 08 P2 — 지급수단 세그먼트(현금/포인트). 계량 제출 전 필수 선택.
 * 48px 터치 타깃 2버튼 카드, 선택 시 브랜드 그린 테두리(라디오 시맨틱).
 */
const PAYOUT_OPTIONS: Array<{ value: PayoutMethod; icon: string; description: string }> = [
  { value: "CASH", icon: "💵", description: "현장에서 직접 현금을 드려요" },
  { value: "POINT", icon: "🪙", description: "사장님 확인 시 포인트로 적립돼요" },
];

function PayoutMethodSelect({
  value,
  onChange,
  disabled,
}: {
  value: PayoutMethod | null;
  onChange: (v: PayoutMethod) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="지급 수단" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {PAYOUT_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`payout-option-${option.value.toLowerCase()}`}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              minHeight: 48,
              padding: "12px 14px",
              borderRadius: radius.button,
              border: `2px solid ${selected ? colors.primary.DEFAULT : gray[200]}`,
              backgroundColor: selected ? colors.primary.light : "#fff",
              cursor: disabled ? "default" : "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 800, color: selected ? colors.primary.dark : gray[900] }}>
              {option.icon} {PAYOUT_METHOD_LABEL[option.value]} 지급
            </span>
            <span style={{ fontSize: 12, color: colors.status.wait, lineHeight: 1.4 }}>{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * [12 §4] 촬영/스캔 시점 디바이스 GPS 1회 취득(promise 래핑). 권한 거부·미지원 시 null(수집 스킵,
 * 크래시 없음). EXIF에 의존하지 않고 디바이스 GPS를 바코드/사진 메타로 첨부한다(위변조·유실 방지).
 */
function captureGeo(): Promise<PickupGeo | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, capturedAt: new Date(pos.timestamp).toISOString() }),
      () => resolve(null),
      // maximumAge 60s: 최근 fix(위치 푸셔가 15s마다 갱신) 재사용 → 즉시 반환. highAccuracy는 지연이 커서 off.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function ArrivedPanel({
  orderId,
  measuredKg,
  finalKg,
  snapshotPricePerKg,
  submittedPayoutMethod,
  existingPhotoUrls,
  orderKind,
  purchaseRequestedCans,
  snapshotFreshCanPrice,
}: {
  orderId: string;
  measuredKg: number | null;
  finalKg: number | null;
  snapshotPricePerKg: number;
  /** 이미 제출된 지급수단(payout_method). 재제출 프리필 + 대기 배너 카피 분기(08 P2). */
  submittedPayoutMethod: PayoutMethod | null;
  /** 이미 제출된 현장 사진 — 재제출 시 새 사진이 없으면 재사용(서버는 매 제출 ≥1장 요구). */
  existingPhotoUrls: string[];
  /** [14 J2] 신유 구매 동반 여부·수량/가격 스냅샷 — deliveredCans 입력·상계 미리보기. */
  orderKind: OrderKind | null;
  purchaseRequestedCans: number | null;
  snapshotFreshCanPrice: number | null;
}) {
  // [14 J2] 구매 동반(PURCHASE/MIXED)이면 현장 배달 통수를 입력받고 폐유 수령액과 상계한다.
  const purchaseInvolved = orderKind === "PURCHASE" || orderKind === "MIXED";
  const [kg, setKg] = useState("");
  const [payout, setPayout] = useState<PayoutMethod | null>(submittedPayoutMethod);
  const [deliveredCans, setDeliveredCans] = useState(purchaseRequestedCans ?? 0);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  // [12 §4] 바코드+GPS 수거이력(캡처 전용 — 지급/정산과 무관). barcodes 리스트 + 첫 캡처 시점 디바이스 GPS.
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [geo, setGeo] = useState<PickupGeo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 08 P2: 재제출(수단 변경) 모드 — 대기 배너 대신 폼을 다시 연다(중재 확정 전까지 허용).
  const [resubmitting, setResubmitting] = useState(false);
  // 제출 전 검증(계량값/사진/수단 누락)은 인라인 에러 유지 — 서버/업로드 실패는 토스트(06 E6).
  const [error, setError] = useState<string | null>(null);
  // 06 E8-③: 순차 업로드 진행 카운트("사진 N/M 업로드 중"). 업로드 중이 아니면 null.
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const { showToast } = useToast();

  // [12 §4] 바코드 1건 추가(스캔/수동 공통). 중복·공백 무시. 첫 추가 시 디바이스 GPS를 1회 취득.
  async function addBarcode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setBarcodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setBarcodeInput("");
    if (!geo) {
      const g = await captureGeo();
      if (g) setGeo(g);
    }
  }
  function removeBarcode(code: string) {
    setBarcodes((prev) => prev.filter((c) => c !== code));
  }
  async function handleScanBarcode() {
    const content = await scanQrCode();
    if (content) await addBarcode(content);
  }

  // 07 §1-3: 중재로 kg가 확정된(final_kg) 주문은 SUBMIT_MEASURE 재제출이 서버에서 거부된다.
  // 폼을 숨기고 확정 무게 + 지급 안내 + 사장님 확인 대기를 안내한다(수단별 카피 — 08 §1-5).
  if (finalKg != null) {
    const arbitratedAmount = estimateCash(finalKg, snapshotPricePerKg);
    const arbitratedPoint = (submittedPayoutMethod ?? "CASH") === "POINT";
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
          {arbitratedPoint
            ? `사장님이 확인하면 포인트 ${formatPoint(arbitratedAmount)}가 적립돼요 — 앱에서 확인을 요청하세요.`
            : `사장님께 현금 ${formatKrw(arbitratedAmount)}을 지급한 뒤 앱에서 수령 확인을 받아주세요.`}
        </p>
      </Card>
    );
  }

  if (measuredKg != null && !resubmitting) {
    const submittedAmount = estimateCash(measuredKg, snapshotPricePerKg);
    const submittedPoint = (submittedPayoutMethod ?? "CASH") === "POINT";
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <PayoutMethodChip method={submittedPayoutMethod ?? "CASH"} />
          <span className="oilpick-tabular-nums" style={{ fontSize: 14, color: gray[900], fontWeight: 600 }}>
            {formatKg(measuredKg)}
          </span>
        </span>
        <p data-testid="measure-wait-copy" style={{ margin: 0, fontSize: 14, color: colors.status.wait }}>
          {submittedPoint
            ? `사장님이 확인하면 포인트 ${formatPoint(submittedAmount)}가 적립돼요 — 확인을 요청하세요.`
            : `사장님께 현금 ${formatKrw(submittedAmount)}을 지급하고 앱에서 수령 확인을 요청하세요.`}
        </p>
        <button
          type="button"
          data-testid="measure-resubmit-button"
          onClick={() => {
            setKg(String(measuredKg));
            setPayout(submittedPayoutMethod);
            setResubmitting(true);
          }}
          style={{
            background: "none",
            border: "none",
            color: colors.primary.DEFAULT,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            padding: "8px 4px",
            minHeight: 44,
          }}
        >
          계량·지급 수단 다시 제출
        </button>
      </Card>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // [14 J2] 구매 동반이면 폐유 없이 신유만 받을 수 있어 kg 0 허용(빈 값=0). 순수 수거는 >0 필수.
    const parsedKg = kg === "" && purchaseInvolved ? 0 : Number(kg);
    if (Number.isNaN(parsedKg) || parsedKg < 0 || (!purchaseInvolved && parsedKg <= 0)) {
      setError("계량값을 확인해주세요.");
      return;
    }
    // 08 P2: 지급수단 미선택 시 제출 불가(서버 zod도 필수 강제).
    if (!payout) {
      setError("지급 수단(현금/포인트)을 선택해주세요.");
      return;
    }
    // [14 J2] 구매 동반 시 배달 통수(0..50) 범위 검증(서버 RPC도 강제).
    if (purchaseInvolved && (deliveredCans < 0 || deliveredCans > 50)) {
      setError("배달한 새 기름 통수를 확인해주세요.");
      return;
    }
    // 재제출은 기존 사진 재사용 허용(서버는 매 제출 photoUrls ≥1장 요구).
    if (photos.length === 0 && existingPhotoUrls.length === 0) {
      setError("현장 사진을 1장 이상 첨부해주세요.");
      return;
    }
    // [12 §4] 첫 제출 시 폐식용유 바코드 ≥1건 필수(수거 시 입력). 재제출·폐유 없는 신유 단독은 면제.
    if (!resubmitting && parsedKg > 0 && barcodes.length === 0) {
      setError("폐식용유 바코드를 1개 이상 스캔하거나 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const [i, photo] of photos.entries()) {
        // E8-③: 제출 버튼 문구로 몇 번째 사진을 올리는 중인지 노출.
        setUploadProgress({ current: i + 1, total: photos.length });
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
      // 업로드 완료 → 전이 호출 동안은 기본 loading("처리 중...")으로 복귀.
      setUploadProgress(null);

      // [12 §4] 바코드 추가 직후 빠르게 제출하면 addBarcode의 비동기 GPS 취득이 아직 끝나지 않아
      // geo가 null일 수 있다 → 제출 시점에 마지막으로 한 번 더 시도(maximumAge 캐시로 즉시 반환).
      const geoForSubmit = geo ?? (await captureGeo());
      if (geoForSubmit && !geo) setGeo(geoForSubmit);

      const result = await invokeEdgeFunction("order-transition", {
        orderId,
        action: "SUBMIT_MEASURE",
        payload: {
          measuredKg: parsedKg,
          photoUrls: uploadedUrls.length > 0 ? uploadedUrls : existingPhotoUrls,
          payoutMethod: payout,
          // [14 J2] 구매 동반 주문은 현장 배달 통수를 함께 제출(상계 계산의 신유 성분).
          ...(purchaseInvolved ? { deliveredCans } : {}),
          // [12 §4] 바코드/GPS 수거이력(있을 때만). RPC가 order_events.payload에 보존.
          ...(barcodes.length > 0 ? { barcodes } : {}),
          ...(geoForSubmit ? { geo: geoForSubmit } : {}),
        },
      });
      if (result.ok) {
        showToast(
          payout === "POINT"
            ? "계량을 제출했어요 — 사장님이 확인하면 포인트가 적립돼요"
            : "계량을 제출했어요 — 현금을 지급하고 사장님 확인을 받아요",
          { variant: "success" },
        );
        setResubmitting(false);
      } else {
        showToast(result.message, { variant: "error" });
      }
    } catch (err) {
      showToast(humanizeSupabaseError(err instanceof Error ? err : null, "사진 업로드 중 오류가 발생했어요."), {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  const payoutAmount = kg ? estimateCash(Number(kg), snapshotPricePerKg) : 0;
  const showEstimate = Boolean(kg) && !Number.isNaN(Number(kg));
  const isPointSelected = payout === "POINT";
  // [14 J2] 신유 대금·상계 미리보기(구매 동반 시). netAmount 양수=점주 지급, 음수=점주 청구.
  const purchaseAmount =
    purchaseInvolved && snapshotFreshCanPrice != null ? estimatePurchase(deliveredCans, snapshotFreshCanPrice) : 0;
  const netAmount = payoutAmount - purchaseAmount;

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

        {/* 08 P2: 지급 수단 선택(필수) — 현금/포인트 세그먼트. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>지급 수단 (필수)</span>
          <PayoutMethodSelect value={payout} onChange={setPayout} disabled={submitting} />
        </div>

        {/* 08 G6-③: 지급액 미리보기 — 수단별 라벨/단위 분기. 앰버(accent) 강조 배너. */}
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
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>
              {isPointSelected ? "점주에게 적립될 포인트" : "점주에게 지급할 현금"}
            </span>
            {/* 05 폴리시: 밝은 배경(accent.light) 위 앰버 "텍스트"는 accent.deep(대비 4.5:1). */}
            <span
              className="oilpick-tabular-nums"
              style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", color: colors.accent.deep }}
            >
              {isPointSelected ? formatPoint(payoutAmount) : formatKrw(payoutAmount)}
            </span>
          </div>
        )}
        {showEstimate && (
          <p style={{ margin: 0, fontSize: 12, color: colors.status.wait, textAlign: "right" }}>
            {isPointSelected ? "현장 계량 기준으로 확정 · 사장님 확인 시 적립" : "현장 계량 기준으로 확정 · 점주에게 직접 지급"}
          </p>
        )}
      </Card>

      {/* [14 J2] 신유 배달 통수 + 현장 상계 미리보기(구매 동반 주문만). */}
      {purchaseInvolved && (
        <Card testId="run-purchase-panel" style={{ gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>새 기름 배달 통수</span>
            <span style={{ fontSize: 12, color: colors.status.wait }}>
              신청 {purchaseRequestedCans ?? 0}통 · 18L 1통 {snapshotFreshCanPrice != null ? formatKrw(snapshotFreshCanPrice) : "-"}
            </span>
          </div>
          <QtyStepper
            value={deliveredCans}
            onChange={setDeliveredCans}
            min={0}
            max={50}
            subLabel={snapshotFreshCanPrice != null ? `${formatKrw(purchaseAmount)} · 18L ${deliveredCans}통` : null}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 12, borderTop: `1px solid ${surface.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.status.wait }}>
              <span>폐유 수령액</span>
              <span className="oilpick-tabular-nums">{formatKrw(payoutAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.status.wait }}>
              <span>새 기름 대금</span>
              <span className="oilpick-tabular-nums">− {formatKrw(purchaseAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 6, borderTop: `1px dashed ${surface.border}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: gray[900] }}>
                {netAmount >= 0 ? "점주에게 지급" : "점주에게 받기"}
              </span>
              <span
                data-testid="run-net-amount"
                className="oilpick-tabular-nums"
                style={{ fontSize: 18, fontWeight: 800, color: netAmount >= 0 ? colors.primary.dark : colors.accent.deep }}
              >
                {formatKrw(Math.abs(netAmount))}
              </span>
            </div>
            {isPointSelected && netAmount < 0 && (
              <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
                포인트 잔액이 부족하면 제출이 거부돼요 — 그때는 현금으로 다시 제출하세요.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>
          현장 사진 {existingPhotoUrls.length > 0 ? "(기존 사진 재사용 가능)" : "(필수)"}
        </span>
        <PhotoUploader photos={photos} onChange={setPhotos} maxCount={3} />
      </Card>

      {/* [12 §4] 폐식용유 바코드 + GPS 수거이력(캡처 전용). 스캔(네이티브) 또는 수동 입력, 첫 추가 시 위치 기록. */}
      <Card style={{ gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: gray[800] }}>
          폐식용유 바코드 {resubmitting ? "(재제출 — 선택)" : "(필수)"}
        </span>
        <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
          통에 붙은 바코드를 스캔하거나 직접 입력하세요. 첫 추가 시 현재 위치(GPS)가 함께 기록돼요.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="barcode-input"
            type="text"
            placeholder="바코드 번호"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addBarcode(barcodeInput);
              }
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            data-testid="barcode-add"
            onClick={() => void addBarcode(barcodeInput)}
            disabled={!barcodeInput.trim()}
            style={{
              minWidth: 64,
              borderRadius: radius.button,
              border: `1px solid ${colors.primary.DEFAULT}`,
              backgroundColor: "#fff",
              color: colors.primary.DEFAULT,
              fontWeight: 700,
              cursor: barcodeInput.trim() ? "pointer" : "not-allowed",
              opacity: barcodeInput.trim() ? 1 : 0.5,
            }}
          >
            추가
          </button>
        </div>
        {isScannerAvailable() && (
          <BigButton type="button" variant="secondary" onClick={handleScanBarcode}>
            바코드 스캔
          </BigButton>
        )}
        {barcodes.length > 0 && (
          <ul
            data-testid="barcode-list"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}
          >
            {barcodes.map((code) => (
              <li
                key={code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: radius.button,
                  backgroundColor: gray[50],
                }}
              >
                <span className="oilpick-tabular-nums" style={{ fontSize: 13, color: gray[900] }}>
                  🏷️ {code}
                </span>
                <button
                  type="button"
                  aria-label={`${code} 삭제`}
                  onClick={() => removeBarcode(code)}
                  style={{ background: "none", border: "none", color: colors.status.wait, fontSize: 18, cursor: "pointer", minHeight: 32, minWidth: 32 }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {geo && (
          <p data-testid="barcode-geo" style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
            📍 위치 기록됨 ({geo.lat.toFixed(5)}, {geo.lng.toFixed(5)})
          </p>
        )}
      </Card>

      {error && (
        <p role="alert" data-testid="run-action-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      {/* E8-③: 업로드 중에는 loading 스피너 문구("처리 중...") 대신 진행 카운트를 버튼에 노출한다
          (loading=true면 BigButton이 children을 숨기므로 disabled로만 잠근다). */}
      <BigButton
        type="submit"
        data-testid="submit-measure-button"
        loading={submitting && !uploadProgress}
        disabled={submitting}
      >
        {uploadProgress ? (
          <span data-testid="upload-progress">
            사진 {uploadProgress.current}/{uploadProgress.total} 업로드 중
          </span>
        ) : (
          "계량 제출 → 사장님 확인 요청"
        )}
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
 * 완료 요약 패널(08 G6-③). CONFIRM_MEASURE/FORCE_COMPLETE로 COMPLETED에 도달한 직후,
 * 확정 지급액(cash_paid_amount)을 수단별로 요약하고 콜 홈으로 복귀시킨다. 오래된 완료분은
 * useActiveRun이 걸러내므로(창 경과) 이 패널은 "완료 직후"에만 노출된다.
 */
function CompletedPanel({
  cashPaidAmount,
  netAmount,
  finalKg,
  payoutMethod,
}: {
  cashPaidAmount: number | null;
  netAmount: number | null;
  finalKg: number | null;
  payoutMethod: PayoutMethod | null;
}) {
  const navigate = useNavigate();
  // payout_method null = 레거시/전환기 → CASH 간주(08 P3 coalesce).
  const isPoint = payoutMethod === "POINT";
  // [14 J4] 실제 주고받은 금액은 상계 순액. cash_paid_amount는 폐유 총액으로 동결돼 있어
  // 상계 주문에서 금액이 다르고 net<0이면 방향까지 반대다(ArrivedPanel 미리보기와 어긋났었다).
  const net = netAmount ?? cashPaidAmount ?? 0;
  const unit = isPoint ? formatPoint(Math.abs(net)) : formatKrw(Math.abs(net));
  const label = isPoint ? "포인트" : "현금";
  const settlementText =
    net === 0 ? "주고받은 금액 없음" : net > 0 ? `${label} ${unit} 지급` : `${label} ${unit} 수령`;
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
      <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: colors.primary.dark }}>
        {net < 0 ? "거래 완료" : "수거 완료"}
      </p>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <PayoutMethodChip method={payoutMethod ?? "CASH"} />
        <p className="oilpick-tabular-nums" style={{ margin: 0, fontSize: 15, color: gray[900] }}>
          {settlementText}
          {finalKg != null ? ` · ${formatKg(finalKg)}` : ""}
        </p>
      </span>
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

/** [사장님께 전화] CTA 전화 아이콘 — user OrderDetailPage PhoneCtaIcon과 동형(E8-④). */
function PhoneCtaIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 4h3l1.2 3.2-1.8 1.4a11 11 0 0 0 4.5 4.5l1.4-1.8L18.5 12.5V15.5c0 1-.8 1.8-1.8 1.7A13.5 13.5 0 0 1 4.8 5.8C4.7 4.8 5.5 4 6.5 4Z"
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
