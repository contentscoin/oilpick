import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, colors, radius, surface } from "@oilpick/ui";
import {
  CS_CATEGORY_LABEL,
  CS_STATUS_LABEL,
  csCategorySchema,
  csTicketInputSchema,
  type CsCategory,
} from "@oilpick/core";
import { useSession } from "../hooks/useSession";
import { supabase } from "../lib/supabaseClient";
import { csTicketsKey, useMyOrderOptions, useMyTickets } from "../hooks/useSupport";

const CATEGORY_ORDER: CsCategory[] = ["ORDER", "CASH_DISPUTE", "COUPON_PAYMENT", "ACCOUNT", "ETC"];

/**
 * 고객센터(07 F12 ③). MyPage "고객센터" placeholder를 대체하는 실 문의 폼 + 내 문의 내역.
 * cs_tickets를 클라이언트가 직접 insert(원장류 아님 — RLS가 author_id·role 위조 차단). 주문 연결은
 * 선택이며, ?category=/?orderId= 쿼리로 프리셋할 수 있다(예: 특정 주문 문의 진입). role은 supplier 고정
 * (user 앱 사용자는 점주 — RLS가 실제 profiles.role과 일치 검증).
 */
export function SupportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  const presetCategory = csCategorySchema.safeParse(searchParams.get("category"));
  const presetOrderId = searchParams.get("orderId");

  const [category, setCategory] = useState<CsCategory>(presetCategory.success ? presetCategory.data : "ORDER");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [orderId, setOrderId] = useState<string>(presetOrderId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: tickets } = useMyTickets(userId);
  const { data: orderOptions } = useMyOrderOptions(userId);

  const options = useMemo(() => orderOptions ?? [], [orderOptions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const parsed = csTicketInputSchema.safeParse({
      category,
      title: title.trim(),
      body: bodyText.trim(),
      orderId: orderId || undefined,
    });
    if (!parsed.success) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: insertErr } = await supabase.from("cs_tickets").insert({
      author_id: userId,
      role: "supplier",
      category: parsed.data.category,
      order_id: parsed.data.orderId ?? null,
      title: parsed.data.title,
      body: parsed.data.body,
    });
    setSubmitting(false);
    if (insertErr) {
      setError("문의 접수에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setTitle("");
    setBodyText("");
    setOrderId("");
    setDone(true);
    queryClient.invalidateQueries({ queryKey: csTicketsKey(userId) });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <PageHeader title="고객센터" onBack={() => navigate(-1)} backTestId="support-back" />

      <form
        onSubmit={handleSubmit}
        data-testid="support-form"
        style={{ display: "flex", flexDirection: "column", gap: 12, borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}` }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: colors.status.wait }}>
          문의 유형
          <select
            data-testid="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CsCategory)}
            style={{ minHeight: 44, borderRadius: radius.button, border: `1px solid ${surface.border}`, padding: "0 12px", fontSize: 15 }}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CS_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: colors.status.wait }}>
          제목
          <input
            data-testid="support-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="무엇을 도와드릴까요?"
            style={{ minHeight: 44, borderRadius: radius.button, border: `1px solid ${surface.border}`, padding: "0 12px", fontSize: 15 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: colors.status.wait }}>
          내용
          <textarea
            data-testid="support-body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="자세한 내용을 적어주세요."
            style={{ borderRadius: radius.button, border: `1px solid ${surface.border}`, padding: 12, fontSize: 15, resize: "vertical" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: colors.status.wait }}>
          주문 연결 (선택)
          <select
            data-testid="support-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ minHeight: 44, borderRadius: radius.button, border: `1px solid ${surface.border}`, padding: "0 12px", fontSize: 15 }}
          >
            <option value="">연결 안 함</option>
            {presetOrderId && !options.some((o) => o.id === presetOrderId) && (
              <option value={presetOrderId}>{presetOrderId.slice(0, 8)}</option>
            )}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p role="alert" data-testid="support-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
            {error}
          </p>
        )}
        {done && (
          <p data-testid="support-success" style={{ color: colors.primary.DEFAULT, fontSize: 14, margin: 0 }}>
            문의가 접수됐어요. 답변은 알림으로 알려드릴게요.
          </p>
        )}

        <button
          type="submit"
          data-testid="support-submit"
          disabled={submitting}
          style={{ minHeight: 48, borderRadius: radius.button, border: "none", backgroundColor: colors.primary.DEFAULT, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}
        >
          문의 접수
        </button>
      </form>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>내 문의 내역</h2>
        {tickets && tickets.length > 0 ? (
          tickets.map((t) => (
            <article
              key={t.id}
              data-testid={`support-ticket-${t.id}`}
              style={{ borderRadius: radius.card, padding: 14, backgroundColor: surface.card, border: `1px solid ${surface.border}`, display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, color: colors.status.wait }}>{CS_CATEGORY_LABEL[t.category]}</span>
                <span
                  data-testid={`support-ticket-status-${t.id}`}
                  style={{ fontSize: 12, fontWeight: 700, color: t.status === "RESOLVED" ? colors.primary.DEFAULT : colors.status.active }}
                >
                  {CS_STATUS_LABEL[t.status]}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t.title}</p>
              <p style={{ margin: 0, fontSize: 14, color: colors.status.wait, whiteSpace: "pre-wrap" }}>{t.body}</p>
              {t.adminReply && (
                <div
                  data-testid={`support-reply-${t.id}`}
                  style={{ marginTop: 4, borderRadius: radius.button, backgroundColor: colors.primary.light, padding: 10 }}
                >
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: colors.primary.dark }}>답변</p>
                  <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{t.adminReply}</p>
                </div>
              )}
            </article>
          ))
        ) : (
          <p data-testid="support-empty" style={{ fontSize: 14, color: colors.status.wait, margin: 0 }}>
            접수한 문의가 없어요.
          </p>
        )}
      </section>
    </main>
  );
}
