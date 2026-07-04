import { useState } from "react";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import type { NotifyBroadcastOutput } from "@oilpick/core";

const TARGET_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "supplier", label: "공급업체만" },
  { value: "rider", label: "라이더만" },
] as const;

/**
 * 03-frontend.md apps/admin "/notify": "전체/역할별 푸시 발송 폼".
 * 04-tasks.md 질문 목록 가정대로 실제 FCM 자격증명이 없는 이 환경에서는 notify-broadcast
 * Edge Function이 notifications insert까지만 수행하고 실제 발송은 로그만 남긴다.
 */
export function NotifyPage() {
  const [target, setTarget] = useState<(typeof TARGET_OPTIONS)[number]["value"]>("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    const res = await invokeEdgeFunction<NotifyBroadcastOutput>("notify-broadcast", {
      target,
      title: title.trim(),
      body: body.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setResult(`${res.data.recipientCount}명에게 알림을 발송했어요.`);
    setTitle("");
    setBody("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">공지</h1>
        <p className="text-sm text-zinc-500">전체 또는 역할별로 공지를 보내요.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg rounded-card bg-white p-6 shadow-sm">
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">대상</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
            data-testid="notify-target-select"
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
            data-testid="notify-title-input"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">내용</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-base outline-none focus:border-primary"
            data-testid="notify-body-input"
          />
        </label>

        {error && <p className="mb-3 text-sm font-medium text-status-danger">{error}</p>}
        {result && <p className="mb-3 text-sm font-medium text-primary">{result}</p>}

        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-white disabled:opacity-60"
          data-testid="notify-submit"
        >
          {busy ? "발송 중..." : "발송"}
        </button>
      </form>
    </div>
  );
}
