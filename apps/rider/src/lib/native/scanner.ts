// 집하장 QR 스캐너(apps/rider R6). 03-frontend.md: "QR 스캐너
// (@capacitor-community/barcode-scanner)→DELIVER 호출".
//
// 웹(브라우저)에는 네이티브 스캐너가 없다 — isNativePlatform() 가드로 no-op(null 반환)하고
// ActiveRunPage의 수동 텍스트 입력 폴백(depotId/qrSecret 직접 입력)을 그대로 사용한다.
// 네이티브에서는 카메라 권한 요청 → QR 스캔 → 스캔된 문자열을 반환한다.

import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-community/barcode-scanner";

/** 네이티브 QR 스캐너 사용 가능 여부(웹은 false → 수동 입력 폴백). */
export function isScannerAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * QR 코드를 스캔해 문자열을 반환한다. 취소/권한거부/웹이면 null.
 * 스캔 중에는 웹뷰 배경을 투명하게 만들어야 카메라 프리뷰가 보이므로 body에 클래스를 토글하고,
 * 종료 시 반드시 원복한다(예외 발생 시에도 finally에서 정리).
 */
export async function scanQrCode(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const status = await BarcodeScanner.checkPermission({ force: true });
  if (!status.granted) {
    return null;
  }

  try {
    await BarcodeScanner.hideBackground();
    document.body.classList.add("scanner-active");
    const result = await BarcodeScanner.startScan();
    if (result.hasContent && result.content) {
      return result.content;
    }
    return null;
  } finally {
    document.body.classList.remove("scanner-active");
    await BarcodeScanner.showBackground();
    await BarcodeScanner.stopScan();
  }
}
