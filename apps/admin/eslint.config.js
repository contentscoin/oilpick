import { baseConfig } from "@oilpick/config/eslint-preset.js";

export default [
  ...baseConfig,
  {
    ignores: ["dist/**", "dist-node/**"],
  },
];
