import { colors, gray } from "@oilpick/ui";

/**
 * lazy 라우트 로딩 중 Suspense fallback. 화면을 통째로 비우지 않고 중앙에 최소 스피너만 표시한다
 * (기존 EmptyState/스켈레톤 톤). 순수 로딩 상태 UI — 데이터/로직 없음.
 */
export function RouteFallback() {
  return (
    <div
      data-testid="route-fallback"
      role="status"
      aria-label="불러오는 중"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        color: gray[400],
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          border: `3px solid ${gray[200]}`,
          borderTopColor: colors.primary.DEFAULT,
          borderRadius: "50%",
          animation: "oilpick-route-spin 0.7s linear infinite",
        }}
      />
      <style>{"@keyframes oilpick-route-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
