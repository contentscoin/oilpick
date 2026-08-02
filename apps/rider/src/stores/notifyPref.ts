import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * [16 L3 §3-5] 콜 알림음 설정 스토어. 마이의 토글이 저장만 하고 발화 주체(CallAlertListener)와
 * 배선돼 있지 않던 것을, Zustand persist(스택 규칙: 로컬 상태=Zustand)로 승격해 두 지점이 같은
 * 상태를 구독하게 한다. mute 계약(useCallAlert.ts): **소리만** 끄고 배너·진동은 유지 — 서버
 * 푸시(백그라운드 FCM)와 무관한 포그라운드 발화 제어다(마이 화면 캡션에 명시).
 */
interface NotifyPrefState {
  /** 콜 도착 포그라운드 알림음 재생 여부(기본 켜짐). */
  soundEnabled: boolean;
  toggleSound: () => void;
}

/** persist 저장 키. */
export const NOTIFY_PREF_STORAGE_KEY = "oilpick:notify-pref";
/** 구 MyPage 로컬 토글이 쓰던 레거시 키("1"/"0") — 최초 1회 이관 후 제거. */
const LEGACY_KEY = "oilpick:notify-enabled";

/** 레거시 키에 저장된 값이 있으면 초기값으로 이관한다(새 키가 이미 있으면 무시). */
function readLegacyInitial(): boolean {
  try {
    if (localStorage.getItem(NOTIFY_PREF_STORAGE_KEY) !== null) return true; // persist가 rehydrate
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) localStorage.removeItem(LEGACY_KEY);
    return legacy !== "0";
  } catch {
    return true; // storage 접근 불가(프라이버시 모드 등) — 기본 켜짐
  }
}

export const useNotifyPref = create<NotifyPrefState>()(
  persist(
    (set) => ({
      soundEnabled: readLegacyInitial(),
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
    }),
    { name: NOTIFY_PREF_STORAGE_KEY },
  ),
);
