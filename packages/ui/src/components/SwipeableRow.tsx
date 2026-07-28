import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { colors, motion as motionTokens, radius, surface } from "../tokens";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * 15-motion-design.md — 행에 숨은 액션(영수증·문의)을 왼쪽 스와이프로 드러내는 리스트 행.
 *
 * 접근성: **스와이프는 액션의 유일한 경로가 아니다.** 액션 버튼은 항상 DOM에 있고 포커스로
 * 도달할 수 있으며(클립되어 보이지 않을 뿐), 포커스가 들어오면 자동으로 열린다.
 * 스와이프는 포인터 사용자를 위한 추가 경로일 뿐이다.
 *
 * 제스처 라이브러리를 쓰지 않는다(15 "하지 않는 것") — Pointer Events로 직접 처리한다.
 */
export interface SwipeableRowProps {
  children: ReactNode;
  /** 드러나는 액션 라벨(예: "영수증"). */
  actionLabel: string;
  onAction: () => void;
  /** 액션 영역 너비(px). 기본 76. */
  actionWidth?: number;
  /** 액션 배경색. 기본 라임(밝은 배경 위 pill이므로 텍스트는 딥그린). */
  actionColor?: string;
  className?: string;
}

export function SwipeableRow({
  children,
  actionLabel,
  onAction,
  actionWidth = 76,
  actionColor = colors.lime.DEFAULT,
  className,
}: SwipeableRowProps) {
  const reduce = usePrefersReducedMotion();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);

  const open = () => setOffset(-actionWidth);
  const close = () => setOffset(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 마우스 우클릭·보조 버튼은 무시.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // 좌표를 싣지 않는 합성 이벤트가 오면 드래그를 시작하지 않는다(NaN 변환 방지).
    if (!Number.isFinite(e.clientX)) return;
    startXRef.current = e.clientX;
    startOffsetRef.current = offset;
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !Number.isFinite(e.clientX)) return;
    const dx = e.clientX - startXRef.current;
    // 왼쪽으로만 열린다(0 ~ -actionWidth로 클램프).
    const next = Math.max(-actionWidth, Math.min(0, startOffsetRef.current + dx));
    setOffset(next);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    // 절반 넘게 끌었으면 열고, 아니면 닫는다.
    if (offset < -actionWidth / 2) open();
    else close();
  };

  return (
    <div
      data-testid="swipeable-row"
      data-open={offset !== 0 ? "true" : "false"}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: radius.card,
        // 가로 스와이프를 브라우저 스크롤에 뺏기지 않게 한다.
        touchAction: "pan-y",
      }}
    >
      <button
        type="button"
        data-testid="swipeable-action"
        onClick={() => {
          onAction();
          close();
        }}
        // 키보드 포커스가 들어오면 가려진 상태로 눌리지 않도록 열어 준다.
        onFocus={open}
        onBlur={close}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: actionWidth,
          border: 0,
          backgroundColor: actionColor,
          color: colors.primary.dark,
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {actionLabel}
      </button>
      <div
        data-testid="swipeable-content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        style={{
          position: "relative",
          transform: `translateX(${offset}px)`,
          transition: dragging || reduce ? undefined : `transform ${motionTokens.base} ${motionTokens.spring}`,
          backgroundColor: surface.card,
          border: `1px solid ${surface.border}`,
          borderRadius: radius.card,
        }}
      >
        {children}
      </div>
    </div>
  );
}
