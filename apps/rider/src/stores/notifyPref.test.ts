// [16 L3 §3-5] 콜 알림음 스토어 — 레거시 키 이관 계약만 고정한다(토글 동작은 MyPage 테스트가 커버).
// 스토어는 모듈 초기화 시점에 localStorage를 읽으므로, 케이스마다 모듈을 새로 로드한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useNotifyPref — 레거시 키 이관", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("레거시 키('0'=꺼짐)가 있으면 초기값으로 이관하고 레거시 키를 지운다", async () => {
    localStorage.setItem("oilpick:notify-enabled", "0");
    const { useNotifyPref } = await import("./notifyPref");
    expect(useNotifyPref.getState().soundEnabled).toBe(false);
    expect(localStorage.getItem("oilpick:notify-enabled")).toBeNull();
  });

  // [16 L10 리뷰 수정] persist는 최초 set 전에는 저장하지 않는다 — write-through가 없으면
  // 이관 직후 앱을 재시작(토글 무접촉)하는 순간 음소거 설정이 기본값 true로 유실됐다.
  it("이관값은 새 키에 즉시 기록된다(재시작 후에도 유지 — write-through)", async () => {
    localStorage.setItem("oilpick:notify-enabled", "0");
    const { NOTIFY_PREF_STORAGE_KEY } = await import("./notifyPref");
    expect(localStorage.getItem(NOTIFY_PREF_STORAGE_KEY)).toContain('"soundEnabled":false');
    // 재기동 시뮬레이션 — 모듈 재로드에서도 false 유지.
    vi.resetModules();
    const { useNotifyPref } = await import("./notifyPref");
    expect(useNotifyPref.getState().soundEnabled).toBe(false);
  });

  it("레거시 키가 없으면 기본 켜짐", async () => {
    const { useNotifyPref } = await import("./notifyPref");
    expect(useNotifyPref.getState().soundEnabled).toBe(true);
  });

  it("toggleSound가 상태를 뒤집고 persist 키에 저장한다", async () => {
    const { useNotifyPref, NOTIFY_PREF_STORAGE_KEY } = await import("./notifyPref");
    useNotifyPref.getState().toggleSound();
    expect(useNotifyPref.getState().soundEnabled).toBe(false);
    expect(localStorage.getItem(NOTIFY_PREF_STORAGE_KEY)).toContain('"soundEnabled":false');
  });
});
