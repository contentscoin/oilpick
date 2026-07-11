import { useState } from "react";
import {
  BigButton,
  BottomSheet,
  CallCard,
  ConfirmSheet,
  DriverCard,
  EmptyState,
  ErrorScreen,
  InfoStatCard,
  LedgerList,
  MapView,
  OfflineBanner,
  OrderTimeline,
  PhotoUploader,
  PointBalanceCard,
  PointHeroAction,
  PriceCard,
  PriceChart,
  QtyStepper,
  SegmentToggle,
  StatusBadge,
  StatusHeadline,
  TabBar,
  Toast,
  colors,
  elevation,
  gradient,
  inputClassName,
  inputStyle,
  radius,
  surface,
  surfaceDark,
  type PhotoAsset,
} from "@oilpick/ui";
import { formatKrw, resampleDaily } from "@oilpick/core";

/** PriceChart/SegmentToggle 목업용 더미 시세(6월 30일치 일별 tick). resampleDaily로 파이프라인 검증. */
const DUMMY_PRICE_TICKS = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, "0");
  const wave = Math.round(60 * Math.sin(i / 3));
  return { effectiveAt: `2026-06-${day}T03:00:00Z`, pricePerKg: 700 + wave + i * 4 };
});

/**
 * 개발 전용 컴포넌트 갤러리 (`/dev-ui`). docs/spec/04-tasks.md T6 DoD:
 * "dev-ui에서 전 컴포넌트 렌더". packages/ui의 모든 공용 컴포넌트를 대표 props로 한 번씩
 * 렌더하고 h2로 라벨링해 육안 구분이 가능하게 한다. Storybook 없이 이 페이지 하나로 대체.
 */
export function DevUiPage() {
  const [qty, setQty] = useState(3);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [chartDays, setChartDays] = useState<"7" | "30" | "90">("30");
  const [scrub, setScrub] = useState<{ date: string; price: number } | null>(null);
  const dailySeries = resampleDaily(DUMMY_PRICE_TICKS, Number(chartDays));
  const heroPrice = scrub?.price ?? dailySeries[dailySeries.length - 1]?.price ?? 0;

  return (
    <main
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 32,
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: surface.app,
        minHeight: "100vh",
      }}
    >
      <h1>packages/ui 컴포넌트 미리보기</h1>

      <section>
        <h2>PriceCard</h2>
        <PriceCard pricePerKg={1250} changeAmount={30} history={[1180, 1200, 1190, 1220, 1250]} />
      </section>

      <section>
        <h2>PriceChart + SegmentToggle (다크 히어로)</h2>
        <div
          style={{
            background: gradient.heroDeep,
            borderRadius: radius.hero,
            boxShadow: elevation.heroDark,
            padding: 20,
            color: surfaceDark.textOnDark,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: surfaceDark.textOnDarkMuted }}>오늘 매입가</p>
          <p
            className="oilpick-tabular-nums"
            style={{ margin: 0, fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}
          >
            {formatKrw(heroPrice)}
            <span style={{ fontSize: 16, fontWeight: 500, color: surfaceDark.textOnDarkMuted }}>/kg</span>
          </p>
          <PriceChart
            data={dailySeries}
            stroke={colors.chart.lineOnDark}
            areaColor={colors.chart.areaTop}
            onDark
            onScrub={setScrub}
            ariaLabel="더미 시세 추이"
          />
          <SegmentToggle
            options={[
              { value: "7", label: "7일" },
              { value: "30", label: "30일" },
              { value: "90", label: "90일" },
            ]}
            value={chartDays}
            onChange={setChartDays}
            ariaLabel="기간 선택"
          />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2>StatusHeadline</h2>
        <StatusHeadline status="ACCEPTED" subtitle="김민준 라이더가 매장으로 이동 중이에요" />
        <StatusHeadline status="COMPLETED" />
        <StatusHeadline status="CANCELLED" />
      </section>

      <section>
        <h2>OrderTimeline</h2>
        <OrderTimeline
          currentStatus="ARRIVED"
          timestamps={{ REQUESTED: "오늘 09:00", ACCEPTED: "오늘 09:05" }}
        />
      </section>

      <section>
        <h2>DriverCard</h2>
        <DriverCard name="김철수" vehicleNo="12가 3456" phone="01000000000" />
      </section>

      <section>
        <h2>InfoStatCard</h2>
        <InfoStatCard
          stats={[
            { label: "예상 수량", value: "15.0kg" },
            { label: "오늘 매입가", value: "700원/kg" },
            { label: "예상 수령액", value: "10,500원", accent: true },
          ]}
          footnote="현장 계량 기준으로 확정됩니다"
        />
      </section>

      <section>
        <h2>CallCard</h2>
        <CallCard
          distanceKm={3.2}
          estimatedKg={45}
          estimatedCash={72000}
          couponCost={3}
          address="서울시 강남구 테헤란로 123"
          onClick={() => {}}
        />
      </section>

      <section>
        {/* 07 F5로 쿠폰 잔액 히어로로 일반화(label/formatValue). 07 F13: 구모델 "출금 신청" 액션 라벨 제거. */}
        <h2>PointBalanceCard</h2>
        <PointBalanceCard
          available={20}
          label="보유 수거쿠폰"
          formatValue={(n) => `${n}장`}
          action={<PointHeroAction>충전하기</PointHeroAction>}
        />
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2>공용 입력 (inputStyle)</h2>
        <label htmlFor="dev-ui-input-sample" style={{ fontSize: 14, fontWeight: 600 }}>
          담당자 이름
        </label>
        <input
          id="dev-ui-input-sample"
          className={inputClassName}
          type="text"
          placeholder="예: 홍길동"
          style={inputStyle}
        />
      </section>

      <section>
        <h2>BigButton</h2>
        <BigButton>수거 요청하기</BigButton>
      </section>

      <section>
        <h2>QtyStepper</h2>
        <QtyStepper value={qty} onChange={setQty} />
      </section>

      <section>
        <h2>BottomSheet</h2>
        <BigButton variant="secondary" onClick={() => setSheetOpen(true)}>
          BottomSheet 열기
        </BigButton>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="수거 요청 확인">
          <p>3통(약 45.0kg) 수거를 요청할까요?</p>
        </BottomSheet>
      </section>

      <section>
        <h2>TabBar</h2>
        <TabBar
          items={[
            { key: "home", label: "홈" },
            { key: "pickup", label: "수거" },
            { key: "wallet", label: "수령액" },
            { key: "my", label: "마이" },
          ]}
          activeKey={activeTab}
          onSelect={setActiveTab}
        />
      </section>

      <section>
        <h2>Toast</h2>
        <Toast message="네트워크 오류가 발생했어요" variant="error" onRetry={() => {}} />
      </section>

      <section>
        <h2>EmptyState</h2>
        <EmptyState title="아직 주문이 없어요" description="첫 수거를 요청해보세요" />
      </section>

      <section>
        <h2>PhotoUploader</h2>
        <PhotoUploader photos={photos} onChange={setPhotos} maxCount={3} />
      </section>

      <section>
        <h2>MapView</h2>
        <MapView
          center={{ lat: 37.5665, lng: 126.978 }}
          pickupLabel="우리식당"
          etaLabel="12분 후 도착"
          style={{ minHeight: 220 }}
        />
      </section>

      <section>
        <h2>StatusBadge</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatusBadge status="REQUESTED" />
          <StatusBadge status="ACCEPTED" />
          <StatusBadge status="ARRIVED" />
          <StatusBadge status="PICKED_UP" />
          <StatusBadge status="COMPLETED" />
          <StatusBadge status="CANCELLED" />
          <StatusBadge status="DISPUTED" />
        </div>
      </section>

      <section>
        {/* 07 F5 쿠폰 변형(현행). 레거시 point 변형(EARN/WITHDRAW_REQUEST 라벨)은 admin 원장 감사에서만 잔존. */}
        <h2>LedgerList (쿠폰)</h2>
        <LedgerList
          variant="coupon"
          entries={[
            { id: 1, entryType: "CHARGE", amount: 30, createdAt: new Date() },
            { id: 2, entryType: "CONSUME", amount: -2, createdAt: new Date() },
            { id: 3, entryType: "REFUND", amount: 2, createdAt: new Date() },
          ]}
        />
      </section>

      {/* ── 05 2026-07-10 폴리시 패스 후속: 스크린샷 검증 사각지대 보강 ── */}

      <section>
        <h2>BigButton (secondary / danger / loading)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BigButton variant="secondary" onClick={() => {}}>
            보조 버튼
          </BigButton>
          <BigButton variant="danger" onClick={() => {}}>
            위험 버튼
          </BigButton>
          <BigButton loading onClick={() => {}}>
            로딩 상태
          </BigButton>
        </div>
      </section>

      <section>
        <h2>StatusHeadline (나머지 상태)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusHeadline status="REQUESTED" />
          <StatusHeadline status="ARRIVED" />
          <StatusHeadline status="DISPUTED" />
        </div>
      </section>

      <section>
        <h2>PriceCard (하락 케이스)</h2>
        <PriceCard
          pricePerKg={1180}
          changeAmount={-40}
          history={DUMMY_PRICE_TICKS.slice(-7).map((t) => t.pricePerKg)}
        />
      </section>

      <section>
        <h2>ErrorScreen</h2>
        <ErrorScreen
          title="주문을 찾을 수 없어요"
          description="삭제됐거나 잘못된 주소일 수 있어요."
          action={
            <BigButton variant="secondary" onClick={() => {}}>
              홈으로 돌아가기
            </BigButton>
          }
        />
      </section>

      <section>
        <h2>ConfirmSheet</h2>
        <BigButton variant="secondary" onClick={() => setConfirmOpen(true)}>
          ConfirmSheet 열기
        </BigButton>
        <ConfirmSheet
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="요청을 취소할까요?"
          description="취소하면 라이더 매칭이 중단돼요."
          confirmLabel="요청 취소"
          danger
        />
      </section>

      <section>
        {/* forceVisible은 프리뷰 전용 prop — 실제 화면은 오프라인 시에만 뜬다(fixed 상단). */}
        <h2>OfflineBanner (프리뷰 강제 표시 — 화면 최상단 fixed)</h2>
        <OfflineBanner forceVisible />
      </section>
    </main>
  );
}
