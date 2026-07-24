import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Toast, type ToastProps } from "./Toast";
import { frameFixedStyle } from "./MobileFrame";

/**
 * 06 E6 — Toast의 전역 프로바이더 승격. 큐/타이머 관리를 이 프로바이더가 맡고(Toast 컴포넌트
 * 주석의 "앱 책임" 이행), 화면들은 useToast().showToast("요청을 취소했어요", { variant: "success" })
 * 한 줄로 피드백을 낸다. 동시 표시는 최대 3개(초과분은 오래된 것부터 제거), 기본 2.6초 자동 소멸.
 * onRetry가 있으면 자동 소멸을 6초로 늘린다(재시도 버튼 누를 시간).
 */
export interface ToastOptions {
  variant?: ToastProps["variant"];
  /** 자동 소멸까지 ms. 기본 2600(onRetry 있으면 6000). */
  durationMs?: number;
  onRetry?: () => void;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** ToastProvider 밖에서 호출하면 개발 실수 — 명시적으로 던진다. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast는 ToastProvider 안에서만 사용할 수 있어요.");
  }
  return ctx;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const MAX_VISIBLE = 3;

export interface ToastProviderProps {
  children: ReactNode;
  /** 화면 하단에서 띄울 간격(px). 탭바가 있는 앱은 탭바 높이만큼 올린다(기본 24). */
  offsetBottom?: number;
}

export function ToastProvider({ children, offsetBottom = 24 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = ++idRef.current;
      const duration = options?.durationMs ?? (options?.onRetry ? 6000 : 2600);
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, ...options }]);
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  // 언마운트 시 잔여 타이머 정리.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          data-testid="toast-stack"
          aria-live="polite"
          style={{
            // [12 §8] 프레임 폭 중앙 정렬 + 좌우 16px 여백(box-sizing으로 프레임 안쪽 유지).
            ...frameFixedStyle,
            bottom: offsetBottom,
            padding: "0 16px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            zIndex: 1100, // 최상위: BottomSheet(50)·OfflineBanner(1000) 위 — 시트 위 피드백도 보여야 한다.
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="oilpick-toast-item"
              style={{ pointerEvents: "auto" }}
              onClick={() => dismiss(t.id)}
            >
              <Toast
                message={t.message}
                variant={t.variant}
                onRetry={
                  t.onRetry
                    ? () => {
                        dismiss(t.id);
                        t.onRetry?.();
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
