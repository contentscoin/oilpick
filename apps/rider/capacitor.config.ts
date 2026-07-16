import type { CapacitorConfig } from "@capacitor/cli";

// apps/rider (rider) Capacitor 6 설정. 03-frontend.md "Capacitor 설정" 절:
// - appId: kr.oilpick.rider
// - webDir: 빌드 산출물('dist')
// - 딥링크 스킴: oilpick-rider:// (푸시 link 필드와 매핑, deeplink.ts에서 파싱)
// - 플러그인: push-notifications / geolocation / camera / app / splash-screen
//   + @capacitor-community/barcode-scanner(rider만, R6 집하장 QR 스캔)
//
// 딥링크 커스텀 스킴은 네이티브 프로젝트에서 처리한다:
//   iOS  → ios/App/App/Info.plist의 CFBundleURLSchemes
//   Android → android/app/src/main/AndroidManifest.xml intent-filter
// Capacitor App 플러그인의 appUrlOpen 이벤트로 oilpick-rider://calls/:id 를 수신한다.
const config: CapacitorConfig = {
  appId: "kr.oilpick.rider",
  appName: "오반장 라이더",
  webDir: "dist",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1B7A43",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
