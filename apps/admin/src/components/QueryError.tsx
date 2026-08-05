/**
 * 쿼리 실패 표면화 공통 컴포넌트. 지금까지 admin 페이지들이 isError를 무시해 쿼리 실패가
 * "0건" 빈 상태로 위장됐다 — 각 페이지에서 useQuery의 isError/refetch를 연결해
 * **빈 상태 분기보다 먼저** 렌더한다. colSpan이 있으면 테이블 행(<tr><td colSpan>)으로,
 * 없으면 일반 div로 렌더한다.
 */
export function QueryError({
  onRetry,
  message = "목록을 불러오지 못했어요",
  colSpan,
}: {
  onRetry: () => void;
  message?: string;
  colSpan?: number;
}) {
  const body = (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p className="text-sm text-gray-600">{message}</p>
      <button
        type="button"
        onClick={() => onRetry()}
        className="min-h-8 rounded-button border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        data-testid="query-error-retry"
      >
        다시 시도
      </button>
    </div>
  );

  if (colSpan !== undefined) {
    return (
      <tr data-testid="query-error">
        <td colSpan={colSpan}>{body}</td>
      </tr>
    );
  }
  return <div data-testid="query-error">{body}</div>;
}
