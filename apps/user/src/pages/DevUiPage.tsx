import { useState } from "react";
import {
  BigButton,
  BottomSheet,
  CallCard,
  CheckList,
  ConfirmSheet,
  DriverCard,
  DynamicIsland,
  EmptyState,
  HeroCard,
  NumberFlow,
  OtpInput,
  SwipeableRow,
  ErrorScreen,
  InfoStatCard,
  LedgerList,
  MapView,
  PayouSymbol,
  PayouWordmark,
  PayouLockup,
  Mascot,
  OfflineBanner,
  OrderTimeline,
  PhotoUploader,
  PayoutMethodChip,
  PointBalanceCard,
  PointHeroAction,
  PriceCard,
  PriceChart,
  PriceStatsRow,
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
  // [15] 모션 프리미티브 프리뷰용 로컬 상태.
  const [devAmount, setDevAmount] = useState(42000);
  const [devOtp, setDevOtp] = useState("482");
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
          address="서울시 강남구 테헤란로 123"
          onClick={() => {}}
        />
      </section>

      <section>
        {/* 08 G5-①: 포인트 지갑 부활 — 잔액 히어로 + [출금 신청] 목업. */}
        <h2>PointBalanceCard (포인트 지갑)</h2>
        <PointBalanceCard
          available={21000}
          held={0}
          action={<PointHeroAction>출금 신청</PointHeroAction>}
        />
      </section>

      <section>
        {/* 08 G4-③: 지급수단 뱃지 — 주문 카드/상세/드로어 공용. */}
        <h2>PayoutMethodChip</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <PayoutMethodChip method="CASH" />
          <PayoutMethodChip method="POINT" />
        </div>
      </section>

      <section>
        {/* 08 G4-②: 기간 시세 통계 행(라이트 변형 — 다크는 홈 히어로에서). */}
        <h2>PriceStatsRow</h2>
        <PriceStatsRow
          data={[
            { date: "2026-07-11", price: 700 },
            { date: "2026-07-12", price: 760 },
            { date: "2026-07-13", price: 640 },
            { date: "2026-07-14", price: 720 },
          ]}
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
        {/* 08 G5-①: point 변형 복권 — 지갑 포인트 내역(EARN/출금/조정). */}
        <h2>LedgerList (포인트)</h2>
        <LedgerList
          variant="point"
          entries={[
            { id: 1, entryType: "EARN", amount: 21000, createdAt: new Date() },
            { id: 2, entryType: "WITHDRAW_REQUEST", amount: -10000, createdAt: new Date() },
            { id: 3, entryType: "WITHDRAW_CANCEL", amount: 10000, createdAt: new Date() },
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
        {/* 10-brand.md B3 — 폐유(payou) 심볼(제리캔+P) + 붓글씨 워드마크 + 락업. */}
        <h2>Payou 브랜드 (심볼 / 워드마크 / 락업)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <PayouSymbol size={56} />
          <PayouWordmark height={40} />
        </div>
        <div style={{ marginTop: 12 }}>
          <PayouLockup height={44} />
        </div>
        {/* 보조 캐릭터(방울 마스코트) — 로고와 별개의 친근한 캐릭터 에셋(선택). */}
        <h2 style={{ marginTop: 20 }}>Mascot (보조 캐릭터)</h2>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 16 }}>
          <Mascot size={48} />
          <Mascot size={96} />
        </div>
      </section>

      <section data-testid="k-compare">
        {/* [15] 목업 반영 전/후 비교 — 정지 화면에서 무엇이 달라졌는지 눈으로 확인하는 자리. */}
        <h2>[15] 지갑 잔액 카드 — 변경 전 / 후</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.status.wait }}>변경 전 (앰버 포인트 히어로)</p>
            <PointBalanceCard available={128400} held={12000} />
          </div>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: colors.status.wait }}>변경 후 (다크 월렛 카드)</p>
            <PointBalanceCard tone="dark" available={128400} held={12000} />
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>[15] 라이더 현장 지급액 바 — 변경 전 / 후</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderRadius: radius.button, backgroundColor: colors.accent.light }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.status.wait }}>점주에게 지급할 현금</span>
            <span className="oilpick-tabular-nums" style={{ fontSize: 20, fontWeight: 800, color: colors.accent.deep }}>43,800원</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: surfaceDark.panel, boxShadow: elevation.heroDark }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: surfaceDark.textOnDarkMuted }}>점주에게 지급할 현금</span>
            <NumberFlow value={43800} format={(n) => formatKrw(Math.round(n))} style={{ fontSize: 24, fontWeight: 800, color: surfaceDark.textOnDark }} />
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>[15] 수거요청 예상액 푸터 — 변경 전 / 후</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ backgroundColor: surface.card, border: `1px solid ${surface.border}`, borderRadius: radius.card, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, color: colors.status.wait }}>예상 수령액</span>
            <span className="oilpick-tabular-nums" style={{ fontSize: 22, fontWeight: 800, color: colors.primary.dark }}>42,000원</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderRadius: radius.card, backgroundColor: surfaceDark.panel, boxShadow: elevation.heroDark }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 13, color: surfaceDark.textOnDarkMuted }}>예상 수령액</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>현장 계량·상계 기준으로 확정돼요</span>
            </span>
            <NumberFlow value={42000} format={(n) => formatKrw(Math.round(n))} style={{ fontSize: 24, fontWeight: 800, color: surfaceDark.textOnDark }} />
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>[15] 라이더 지급액 히어로 — 변경 전 / 후</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: "24px 20px", borderRadius: radius.hero, background: gradient.point, boxShadow: elevation.raised, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>예상 매입 지급액</p>
            <p className="oilpick-tabular-nums" style={{ margin: "4px 0 0", fontSize: 40, fontWeight: 800, color: "#fff" }}>42,000원</p>
          </div>
          <div style={{ padding: "24px 20px", borderRadius: radius.hero, background: `radial-gradient(circle at 82% 12%, ${colors.lime.soft}, transparent 40%), ${gradient.heroDeep}`, boxShadow: elevation.heroDark, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: surfaceDark.textOnDarkMuted }}>예상 매입 지급액</p>
            <p style={{ margin: "4px 0 0" }}>
              <NumberFlow value={42000} format={(n) => formatKrw(Math.round(n))} style={{ fontSize: 40, fontWeight: 800, color: surfaceDark.textOnDark }} />
            </p>
          </div>
        </div>
      </section>

      <section>
        {/* 15-motion-design.md — beUI 모션 프리미티브. 모션은 상태 서술이므로 정지해도 정보가 남는다. */}
        <h2>[15] DynamicIsland / NumberFlow</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <DynamicIsland>14:35 도착 · 1.8km</DynamicIsland>
          <DynamicIsland live={false}>라이더 위치 신호가 끊겼어요</DynamicIsland>
          <BigButton variant="secondary" onClick={() => setDevAmount((n) => (n === 42000 ? 128400 : 42000))}>
            금액 바꾸기 (NumberFlow)
          </BigButton>
          <NumberFlow
            value={devAmount}
            format={(n) => formatKrw(Math.round(n))}
            style={{ fontSize: 32, fontWeight: 800, color: colors.primary.dark }}
          />
        </div>

        <h2 style={{ marginTop: 20 }}>[15] HeroCard</h2>
        <HeroCard
          eyebrow="Live Activity"
          title="성수동 튀김공방 2.4km"
          description="상태가 접히면 island로 축약되고, 펼치면 운행 체크리스트로 전환됩니다."
        />

        <h2 style={{ marginTop: 20 }}>[15] CheckList</h2>
        <CheckList
          items={[
            { label: "상호 확인", state: "done" },
            { label: "현장 도착 인증", state: "current" },
            { label: "계량 입력", state: "todo" },
          ]}
        />

        <h2 style={{ marginTop: 20 }}>[15] OtpInput (정상 / 오류)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <OtpInput value={devOtp} onChange={setDevOtp} />
          <OtpInput value="482910" onChange={() => {}} error errorMessage="인증번호가 올바르지 않습니다" />
        </div>

        <h2 style={{ marginTop: 20 }}>[15] SwipeableRow (왼쪽으로 스와이프 · Tab으로도 도달)</h2>
        <SwipeableRow actionLabel="문의" onAction={() => {}}>
          <div style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>계량 완료 정산</span>
            <span style={{ fontWeight: 700, color: colors.primary.DEFAULT }}>+42,000원</span>
          </div>
        </SwipeableRow>
      </section>

      <section>
        {/* forceVisible은 프리뷰 전용 prop — 실제 화면은 오프라인 시에만 뜬다(fixed 상단). */}
        <h2>OfflineBanner (프리뷰 강제 표시 — 화면 최상단 fixed)</h2>
        <OfflineBanner forceVisible />
      </section>
    </main>
  );
}
