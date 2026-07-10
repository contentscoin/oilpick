// 06 E3 — 콜 도착 알림음. 외부 오디오 에셋 없이 Web Audio(AudioContext oscillator)로
// 짧은 상행 2음을 합성한다. 알림음은 부가 피드백이므로 어떤 실패(AudioContext 미지원,
// 사용자 제스처 전 autoplay 정책 차단 등)도 화면 흐름을 깨지 않게 try/catch로 무해화한다.

/** useCallAlert에 주입 가능한 알림음 시그니처(테스트에서 spy/mute로 대체용). */
export type AlertSoundFn = () => void;

/** 두 음(880Hz → 1174.7Hz, 상행 "딩-동")의 주파수/타이밍. 총 ~0.4초. */
const NOTES: ReadonlyArray<{ freq: number; at: number; duration: number }> = [
  { freq: 880, at: 0, duration: 0.15 },
  { freq: 1174.7, at: 0.16, duration: 0.22 },
];

/** 콜 도착 알림음 재생. 실패해도 조용히 무시한다(no-throw 보장 — 배너/진동은 계속 동작). */
export function playCallAlertSound(): void {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();

    for (const { freq, at, duration } of NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // 클릭 노이즈 방지: 짧은 attack 후 지수 감쇠 엔벨로프.
      const start = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }

    // 마지막 음이 끝난 뒤 컨텍스트를 닫아 오디오 리소스를 정리한다(닫기 실패도 무시).
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 600);
  } catch {
    // 알림음 실패는 무해화 — 호출부(useCallAlert)는 배너/진동을 계속 발화한다.
  }
}
