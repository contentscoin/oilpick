import { EmptyState } from "@oilpick/ui";

/**
 * R7~R9(정산/인증카드), R10~R12(이력/마이/알림)은 이번 태스크(T9) 범위 밖이다
 * (04-tasks.md T9 DoD, 태스크 지시사항: "R7~R9 ... 이번 태스크 범위 아님(T10). 지금은 하단 탭에
 * 자리만 만들고 '준비 중' placeholder로 둬도 된다"). T10에서 실제 화면으로 교체된다.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <EmptyState title={title} description="다음 업데이트에서 만나요." />
    </main>
  );
}
