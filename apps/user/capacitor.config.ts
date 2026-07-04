import type { CapacitorConfig } from "@capacitor/cli";

// apps/user (supplier) Capacitor 6 설정. 03-frontend.md "Capacitor 설정" 절:
// - appId: kr.oilpick.user
// - webDir: 빌드 산출물('dist')
// - 딥링크 스킴: oilpick-user:// (푸시 link 필드와 매핑, deeplink.ts에서 파싱)
// - 플러그인: push-notifications / geolocation / camera / app / splash-screen
//
// 딥링크 커스텀 스킴은 네이티브 프로젝트에서 처리한다:
//   iOS  → ios/App/App/Info.plist의 CFBundleURLSchemes (cap add 후 수동/스크립트로 주입)
//   Android → android/app/src/main/AndroidManifest.xml intent-filter
// Capacitor App 플러그인의 appUrlOpen 이벤트로 oilpick-user://orders/:id 를 수신한다.
const config: CapacitorConfig = {
  appId: "kr.oilpick.user",
  appName: "OilPick",
  webDir: "dist",
  plugins: {
    // 스플래시: 네이티브 부팅 시 잠깐 표시 후 웹뷰 준비되면 숨긴다(코드에서 hide 호출).
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1B7A43",
      showSpinner: false,
    },
    // 푸시 알림 표시 옵션(iOS foreground presentation). Android는 채널 기본값 사용.
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
