import { Link } from "react-router-dom";

/** catch-all 404 — 이전에는 미지정 URL이 셸만 있는 빈 화면이었다. 안내 + 대시보드 복귀 링크 제공. */
export function NotFoundPage() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center"
      data-testid="not-found"
    >
      <p className="text-5xl font-bold tabular-nums text-gray-300">404</p>
      <h1 className="text-lg font-semibold text-gray-900">페이지를 찾을 수 없어요</h1>
      <p className="text-sm text-gray-500">주소가 바뀌었거나 삭제된 페이지예요.</p>
      <Link
        to="/"
        className="mt-2 rounded-button bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}
