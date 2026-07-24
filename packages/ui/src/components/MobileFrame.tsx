import type { ReactNode } from "react";
import { surface } from "../tokens";

/**
 * [12 §8] 모바일 고정 레이아웃 프레임.
 * 앱 루트를 고정 모바일 폭(FRAME_MAX_WIDTH)으로 감싼다. 데스크톱에서는 중앙 정렬 +
 * 바깥 뉴트럴 여백(GUTTER_BG) + 은은한 프레임 그림자로 "모바일 앱" 인상을 준다.
 * 모바일(뷰포트 < 420)에서는 프레임이 전폭이라 시각적 변화가 없다.
 *
 * 주의: 프레임에 transform으로 containing block을 만들면 position:fixed 자식이
 * 스크롤을 따라 움직이는 회귀가 생긴다(모바일 sticky CTA 깨짐). 그래서 여기선
 * containing block을 만들지 않고, 각 고정 요소(OfflineBanner·Toast·BottomSheet·
 * sticky CTA 등)가 `frameFixedStyle`로 스스로 프레임 폭에 중앙 정렬하도록 한다.
 */
export const FRAME_MAX_WIDTH = 420;

/** 데스크톱 바깥 여백색(뉴트럴 웜그레이 — surface.app 크림과 조화). */
const GUTTER_BG = "#E7E3D9";

/**
 * position:fixed 오버레이를 뷰포트 고정을 유지한 채 프레임 폭(FRAME_MAX_WIDTH)으로
 * 중앙 정렬하는 공용 스타일 조각. 모바일에선 maxWidth ≥ 뷰포트라 전폭과 동일하게 동작.
 * 사용처는 top/bottom 등 세로 위치만 따로 지정한다.
 */
export const frameFixedStyle = {
  position: "fixed" as const,
  left: "50%",
  transform: "translateX(-50%)",
  width: "100%",
  maxWidth: FRAME_MAX_WIDTH,
  // 패딩이 있는 고정 요소(OfflineBanner·CallAlert 등)가 width를 넘지 않도록 border-box 고정.
  boxSizing: "border-box" as const,
};

export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        backgroundColor: GUTTER_BG,
      }}
    >
      <div
        data-testid="mobile-frame"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: FRAME_MAX_WIDTH,
          minHeight: "100dvh",
          backgroundColor: surface.app,
          boxShadow: "0 0 0 1px rgba(17,61,37,0.05), 0 12px 48px rgba(17,61,37,0.07)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
