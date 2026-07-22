// Daum(카카오) 우편번호 검색 위젯 로더 — **API 키 불필요**(12 S2). 주소 문자열만 얻고,
// 좌표는 geocode.ts(VWorld)가 별도로 변환한다. 스크립트 로드 실패·사용자 취소 시 null.

const SCRIPT_ID = "daum-postcode-sdk";
const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsdk/mapcomponent/postcode/postcode.v2.js";

interface DaumPostcodeData {
  roadAddress: string;
  jibunAddress: string;
  address: string;
}

interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void;
  onclose?: (state: string) => void;
}

interface DaumPostcodeConstructor {
  new (options: DaumPostcodeOptions): { open: () => void };
}

declare global {
  interface Window {
    daum?: { Postcode?: DaumPostcodeConstructor };
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.daum?.Postcode) {
      resolve(true);
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.daum?.Postcode)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.daum?.Postcode));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * 우편번호 검색 위젯을 띄우고 선택된 도로명 주소를 반환한다. 스크립트 로드 실패나 사용자
 * 취소(선택 없이 닫기) 시 null. 도로명이 없으면 지번/기본 주소로 폴백한다.
 */
export async function openPostcodeSearch(): Promise<string | null> {
  const loaded = await loadScript();
  const Postcode = window.daum?.Postcode;
  if (!loaded || !Postcode) return null;

  return new Promise((resolve) => {
    let completed = false;
    new Postcode({
      oncomplete: (data) => {
        completed = true;
        resolve(data.roadAddress || data.address || data.jibunAddress || null);
      },
      onclose: (state) => {
        // 선택 없이 닫힌 경우(FORCE_CLOSE)만 취소로 처리 — oncomplete가 이미 resolve했으면 무시된다.
        if (!completed && state === "FORCE_CLOSE") resolve(null);
      },
    }).open();
  });
}
