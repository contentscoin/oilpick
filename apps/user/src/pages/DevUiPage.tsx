import { useState } from "react";
import {
  BigButton,
  BottomSheet,
  CallCard,
  DriverCard,
  EmptyState,
  LedgerList,
  MapView,
  OrderTimeline,
  PhotoUploader,
  PointBalanceCard,
  PointHeroAction,
  PriceCard,
  QtyStepper,
  StatusBadge,
  StatusHeadline,
  TabBar,
  Toast,
  surface,
  type PhotoAsset,
} from "@oilpick/ui";

/**
 * 개발 전용 컴포넌트 갤러리 (`/dev-ui`). docs/spec/04-tasks.md T6 DoD:
 * "dev-ui에서 전 컴포넌트 렌더". packages/ui의 모든 공용 컴포넌트를 대표 props로 한 번씩
 * 렌더하고 h2로 라벨링해 육안 구분이 가능하게 한다. Storybook 없이 이 페이지 하나로 대체.
 */
export function DevUiPage() {
  const [qty, setQty] = useState(3);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);

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
        <h2>StatusHeadline</h2>
        <StatusHeadline status="ACCEPTED" />
      </section>

      <section>
        <h2>OrderTimeline</h2>
        <OrderTimeline currentStatus="ARRIVED" />
      </section>

      <section>
        <h2>DriverCard</h2>
        <DriverCard name="김철수" vehicleNo="12가 3456" phone="01000000000" />
      </section>

      <section>
        <h2>CallCard</h2>
        <CallCard
          distanceKm={3.2}
          estimatedKg={45}
          pickupFee={5000}
          address="서울시 강남구 테헤란로 123"
          onClick={() => {}}
        />
      </section>

      <section>
        <h2>PointBalanceCard</h2>
        <PointBalanceCard
          available={128000}
          held={15000}
          action={<PointHeroAction>출금 신청</PointHeroAction>}
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
            { key: "wallet", label: "포인트" },
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
        <MapView center={{ lat: 37.5665, lng: 126.978 }} />
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
        <h2>LedgerList</h2>
        <LedgerList
          entries={[
            { id: 1, entryType: "EARN", amount: 54000, createdAt: new Date() },
            { id: 2, entryType: "HOLD", amount: 5000, createdAt: new Date() },
            { id: 3, entryType: "WITHDRAW_REQUEST", amount: -20000, createdAt: new Date() },
          ]}
        />
      </section>
    </main>
  );
}
