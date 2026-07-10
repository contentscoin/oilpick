import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton } from "@oilpick/ui";
import { colors, surface } from "@oilpick/ui";
import { ONBOARDING_DONE_KEY } from "./onboardingKey";

// 상수는 onboardingKey.ts로 분리(App.tsx eager 진입이 페이지 lazy 청크를 끌어오지 않도록).
// 기존 import 경로 호환을 위해 여기서 재-export한다.
export { ONBOARDING_DONE_KEY };

interface Slide {
  title: string;
  description: string;
  emoji: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "🛢️",
    title: "폐식용유, 앱으로 간편하게 수거 요청",
    description: "통 수만 입력하면 예상 현금 수령액을 바로 확인할 수 있어요.",
  },
  {
    emoji: "🚚",
    title: "인증된 라이더가 직접 방문 수거",
    description: "라이더 위치를 실시간으로 확인하고, 현장 계량 결과를 앱에서 바로 확인하세요.",
  },
  {
    emoji: "💰",
    title: "수거 완료 시 현장에서 현금 수령",
    description: "라이더가 계량한 무게만큼 그 자리에서 현금을 지급해요.",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  // SLIDES는 고정된 비어있지 않은 배열이고 index는 0..SLIDES.length-1로만 관리되므로 항상 유효하다.
  const slide = SLIDES[index] as Slide;

  function finish() {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    navigate("/auth", { replace: true });
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginTop: 24,
        }}
        data-testid="onboarding-dots"
      >
        {SLIDES.map((s, i) => (
          <span
            key={s.title}
            data-testid={`onboarding-dot-${i}`}
            style={{
              width: i === index ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === index ? colors.primary.DEFAULT : surface.border,
              transition: "width 0.2s",
            }}
          />
        ))}
      </div>

      {/* key={index}로 슬라이드 교체마다 페이드인(styles.css oilpick-fade-in-up,
          prefers-reduced-motion 시 animation:none). 이모지는 브랜드 틴트 원 안에 앉혀 위계를 준다. */}
      <div
        key={index}
        className="oilpick-fade-in-up"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 16,
          flex: 1,
          justifyContent: "center",
        }}
        data-testid={`onboarding-slide-${index}`}
      >
        <div
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 128,
            height: 128,
            borderRadius: "50%",
            backgroundColor: colors.primary.light,
            fontSize: 64,
          }}
        >
          {slide.emoji}
        </div>
        <h1 style={{ fontSize: 24, margin: 0 }}>{slide.title}</h1>
        <p style={{ fontSize: 16, color: colors.status.wait, margin: 0, maxWidth: 320 }}>
          {slide.description}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BigButton
          onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          data-testid="onboarding-next"
        >
          {isLast ? "시작하기" : "다음"}
        </BigButton>
        {!isLast && (
          <button
            type="button"
            data-testid="onboarding-skip"
            onClick={finish}
            style={{
              background: "none",
              border: "none",
              color: colors.status.wait,
              fontSize: 14,
              padding: 12,
              cursor: "pointer",
            }}
          >
            건너뛰기
          </button>
        )}
      </div>
    </main>
  );
}
