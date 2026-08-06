/**
 * [19 T3] admin 공용 UI 프리미티브. docs/spec/19-admin-console.md §1 T3.
 *
 * 왜 앱 내부에 두는가: 03-frontend.md는 "packages/ui는 admin에서 재사용하지 않는다"를 원칙으로
 * 둔다(MapView만 기존 예외). admin은 Tailwind + shadcn 톤이고 user/rider는 인라인 스타일 기반이라
 * 시각 언어가 다르다 — 공유하면 양쪽 다 끌려간다. 그래서 admin 전용 프리미티브를 여기 모은다.
 *
 * [03 레이아웃 강건성] 전 컴포넌트 공통:
 *   - 텍스트 컨테이너에 고정 height/width 금지 → min-h + padding으로 높이를 만든다.
 *   - nowrap이 필요한 곳은 truncate + min-w-0 3종 세트로만.
 *   - 정보 행은 flex-wrap 기본.
 */
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useEscapeClose, useInitialFocus } from "../../hooks/useEscapeClose";

/** data-testid 통과용 최소 타입 — Record<string, unknown> 스프레드는 strict에서 JSX에 못 꽂는다. */
interface TestId {
  "data-testid"?: string;
}

// ───────────────────────── Button ─────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-card hover:bg-primary-dark",
  secondary: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100",
  // status-danger — 프리셋에 top-level `danger` 색은 없다(있는 줄 알고 쓰면 클래스가 통째로 죽는다).
  danger: "bg-status-danger text-white hover:opacity-90",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-2.5 py-1 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-button font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    />
  );
});

// ───────────────────────── Badge ─────────────────────────

export type BadgeTone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  primary: "bg-primary-light text-primary",
  accent: "bg-accent-light text-accent-deep",
  success: "bg-primary-light text-primary",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-status-danger/10 text-status-danger",
};

export function Badge({
  tone = "neutral",
  children,
  title,
  className = "",
  ...rest
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  className?: string;
} & TestId) {
  return (
    <span
      title={title}
      className={`inline-block rounded-pill px-2 py-0.5 text-xs font-semibold ${BADGE_TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

// ───────────────────────── Card / PageHeader ─────────────────────────

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
} & TestId) {
  return (
    <section className={`rounded-card bg-white p-4 shadow-card sm:p-6 ${className}`} {...rest}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ───────────────────────── StatCard ─────────────────────────

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  ...rest
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "accent" | "danger";
} & TestId) {
  const valueTone =
    tone === "accent" ? "text-accent-deep" : tone === "danger" ? "text-status-danger" : "text-gray-900";
  return (
    <div className="min-w-0 rounded-card bg-white p-4 shadow-card sm:p-5" {...rest}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueTone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Tabs ─────────────────────────

export interface TabItem<T extends string> {
  value: T;
  label: string;
  testId?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  size = "md",
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-1.5 text-sm";
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            data-testid={item.testId}
            className={`min-h-8 rounded-pill font-medium shadow-card transition-colors ${pad} ${
              active ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────── SearchInput / Field ─────────────────────────

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (next: string) => void;
  label: string;
}

export function SearchInput({ value, onValueChange, label, className = "", ...rest }: SearchInputProps) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <input
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="w-full min-w-0 rounded-button border border-gray-200 px-3 py-2 pr-8 text-sm outline-none focus:border-primary"
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onValueChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-pill px-1 text-sm text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

/** Field 안에서 쓰는 표준 텍스트 입력 — 페이지마다 흩어져 있던 클래스 문자열을 한 곳으로. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full min-w-0 rounded-button border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary ${className}`}
        {...rest}
      />
    );
  },
);

// ───────────────────────── EmptyState ─────────────────────────

export function EmptyState({
  title,
  description,
  action,
  ...rest
}: {
  title: string;
  description?: string;
  action?: ReactNode;
} & TestId) {
  return (
    <div className="rounded-card border border-dashed border-gray-200 bg-white p-8 text-center" {...rest}>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// ───────────────────────── TableShell ─────────────────────────

/**
 * 표 공통 껍데기 — 가로 스크롤 래퍼(페이지 자체가 가로로 밀리지 않게) + sticky thead.
 * 로딩/에러/빈 상태는 호출부가 children으로 넘기되, colSpan 계산이 필요한 공통 행은
 * TableMessageRow로 제공한다.
 */
export function TableShell({
  headers,
  children,
  className = "",
  ...rest
}: {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
} & TestId) {
  return (
    <div className={`overflow-x-auto rounded-card bg-white shadow-card ${className}`}>
      <table className="w-full text-left text-sm" {...rest}>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
            {headers.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableMessageRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-500">
        {children}
      </td>
    </tr>
  );
}

// ───────────────────────── Drawer ─────────────────────────

/** 우측 드로어 — ESC 닫기 + 초기 포커스(기존 훅 재사용). 주문 상세 드로어와 같은 상호작용. */
export function Drawer({
  title,
  onClose,
  children,
  ...rest
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
} & TestId) {
  useEscapeClose(onClose);
  const dialogRef = useInitialFocus<HTMLDivElement>();
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="h-full w-full max-w-lg overflow-y-auto bg-surface-app p-4 shadow-raised sm:p-6"
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 text-lg font-bold text-gray-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="닫기">
            닫기
          </Button>
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────── DescriptionList ─────────────────────────

export interface DescriptionItem {
  label: string;
  value: ReactNode;
  /** 값이 길어 한 줄을 다 쓰는 항목(주소·사유 등). */
  full?: boolean;
}

export function DescriptionList({ items, ...rest }: { items: DescriptionItem[] } & TestId) {
  return (
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2" {...rest}>
      {items.map((item, i) => (
        <div key={i} className={`min-w-0 ${item.full ? "sm:col-span-2" : ""}`}>
          <dt className="text-xs text-gray-500">{item.label}</dt>
          <dd className="mt-0.5 font-medium text-gray-800">{item.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────────────────── Gauge ─────────────────────────

/**
 * 사용/한도 게이지바 — 좌상 크레딧(18)의 시각 언어를 admin·좌상 콘솔에서 공유한다.
 * ratio가 1을 넘으면(오버부킹·한도 초과) 위험 톤으로 넘어가고 막대는 100%에서 잘린다.
 */
export function Gauge({
  used,
  limit,
  label,
  ...rest
}: {
  used: number;
  limit: number;
  label?: ReactNode;
} & TestId) {
  const ratio = limit > 0 ? used / limit : used > 0 ? 1 : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const tone = ratio >= 1 ? "bg-status-danger" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="min-w-0" {...rest}>
      {label && <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">{label}</div>}
      <div className="h-2 w-full overflow-hidden rounded-pill bg-gray-100" role="presentation">
        <div className={`h-full rounded-pill transition-all ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
