import { BottomSheet } from "./BottomSheet";
import { BigButton } from "./BigButton";
import { colors } from "../tokens";

/**
 * 06-enhancement-plan.md E5 — 되돌릴 수 없는 액션(주문 취소 등) 확인 다이얼로그. BottomSheet 위에
 * 얹어 "정말 하시겠어요?" 2버튼(확인/취소)을 표준화한다. danger=true면 확인 버튼이 위험(빨강)색.
 * confirm 로직/로딩은 호출부가 소유하고, 이 컴포넌트는 표현 + 버튼 배치만 담당한다.
 */
export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** 확인 버튼을 위험(빨강)으로. 취소·삭제 등 되돌릴 수 없는 액션에 사용. */
  danger?: boolean;
  /** 확인 처리 중(버튼 로딩 + 중복 클릭 방지). */
  loading?: boolean;
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  danger = false,
  loading = false,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div data-testid="confirm-sheet" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {description && (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: colors.status.wait }}>{description}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BigButton
            data-testid="confirm-sheet-confirm"
            variant={danger ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </BigButton>
          <BigButton
            data-testid="confirm-sheet-cancel"
            variant="secondary"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </BigButton>
        </div>
      </div>
    </BottomSheet>
  );
}
