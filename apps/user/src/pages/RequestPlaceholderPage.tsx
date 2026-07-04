import { EmptyState } from "@oilpick/ui";

/**
 * U5(수거 요청 3스텝)는 T8 범위다(04-tasks.md T7 작업 지시: "실제 요청 폼은 T8에서 구현").
 * 지금은 홈의 "수거 요청하기" 버튼이 이동할 자리만 만들어 둔다.
 */
export function RequestPlaceholderPage() {
  return (
    <main style={{ padding: 20 }}>
      <EmptyState title="수거 요청 화면 준비 중" description="다음 업데이트에서 만나요." />
    </main>
  );
}
