import { useEffect, useRef } from "react";

/**
 * 모달/드로어 공통 a11y 훅 — Escape keydown 시 onClose를 호출한다(cleanup 포함).
 * role="dialog" aria-modal="true"인 오버레이(OrderDetailDrawer, CS 문의 드로어,
 * 쿠폰 수동 조정 모달)에서 사용한다. 포커스 트랩은 범위 밖.
 */
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 한글 IME 조합 중 Escape는 "조합 취소"다 — 이때 드로어까지 닫으면 작성 중이던
      // 답변(로컬 state)이 unmount로 유실된다. isComposing(레거시 브라우저는 keyCode 229)이면 무시.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
}

/**
 * aria-modal 다이얼로그의 초기 포커스 이동 — aria-modal은 SR에 "다이얼로그 밖은 없는 콘텐츠"라고
 * 선언하므로, 포커스가 트리거(배경)에 남아 있으면 사용자가 '존재하지 않는' 영역에 서 있게 된다.
 * 반환된 ref를 다이얼로그 컨테이너(tabIndex={-1} 필수)에 달면 mount 시 포커스를 옮긴다.
 * 프로그램적 포커스는 :focus-visible에 걸리지 않아 시각 링은 뜨지 않는다. 포커스 트랩은 범위 밖.
 */
export function useInitialFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
