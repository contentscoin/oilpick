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
