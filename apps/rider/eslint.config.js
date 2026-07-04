import { baseConfig } from "@oilpick/config/eslint-preset.js";

export default [
  ...baseConfig,
  {
    // 네이티브(Capacitor) 프로젝트는 lint 대상이 아니다. cap sync가 dist를
    // ios/App/App/public, android/.../assets/public로 복사하는데(빌드 산출물),
    // 이 미니파이 번들과 네이티브 스캐폴드는 소스가 아니므로 ESLint에서 제외한다.
    ignores: ["dist/**", "dist-node/**", "ios/**", "android/**", "assets/**"],
  },
];
