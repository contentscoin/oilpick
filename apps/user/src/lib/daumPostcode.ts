// Daum(카카오) 우편번호 검색 위젯 로더 — **API 키 불필요**(12 S2). 주소 문자열만 얻고,
// 좌표는 geocode.ts(VWorld)가 별도로 변환한다. 스크립트 로드 실패·사용자 취소 시 null.

const SCRIPT_ID = "daum-postcode-sdk";
// ⚠️ 공식 임베드 경로. 이전 값 `mapjsdk/mapcomponent/postcode/postcode.v2.js`는 존재하지 않는
// 경로라 CDN이 403을 돌려줬고, 그 결과 주소검색이 프로덕션에서 통째로 동작하지 않았다.
// (postcode.map.daum.net 가이드 기준. 키·도메인 등록 불필요.)
const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

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
 * 우편번호 검색 결과. 호출부가 **"사용자가 취소"와 "위젯을 못 띄움"을 구분**할 수 있어야 한다 —
 * 둘 다 null로 뭉개면 스크립트가 죽었을 때 버튼을 눌러도 아무 일도 안 일어나 사용자가
 * 원인을 알 수 없다(실제로 프로덕션에서 그렇게 동작했다).
 */
export type PostcodeResult =
  | { status: "picked"; address: string }
  | { status: "cancelled" }
  | { status: "unavailable" };

/**
 * 우편번호 검색 위젯을 띄우고 선택된 도로명 주소를 반환한다. 도로명이 없으면 지번/기본 주소로
 * 폴백한다. 스크립트 로드 실패는 `unavailable`, 선택 없이 닫으면 `cancelled`.
 */
export async function openPostcodeSearch(): Promise<PostcodeResult> {
  const loaded = await loadScript();
  const Postcode = window.daum?.Postcode;
  if (!loaded || !Postcode) return { status: "unavailable" };

  return new Promise<PostcodeResult>((resolve) => {
    let completed = false;
    new Postcode({
      oncomplete: (data) => {
        completed = true;
        const address = data.roadAddress || data.address || data.jibunAddress || "";
        resolve(address ? { status: "picked", address } : { status: "cancelled" });
      },
      onclose: (state) => {
        // 선택 없이 닫힌 경우(FORCE_CLOSE)만 취소로 처리 — oncomplete가 이미 resolve했으면 무시된다.
        if (!completed && state === "FORCE_CLOSE") resolve({ status: "cancelled" });
      },
    }).open();
  });
}
