// Shared Tailwind preset for OilPick apps.
// Design tokens per docs/spec/03-frontend.md "디자인 토큰" 절.
// Canonical token source lives in packages/ui/src/tokens.ts (T6) — this preset
// only re-shapes those values into Tailwind's theme format. Do not redefine
// color/spacing/radius values here; edit tokens.ts instead.
//
// Imported via relative path (not the "@oilpick/ui" package specifier) to avoid
// a circular workspace dependency: @oilpick/ui already depends on
// @oilpick/config for its tsconfig/eslint presets, so @oilpick/config cannot
// also declare a package.json dependency back on @oilpick/ui.
import { colors, gray, radius, touchTarget } from "../ui/src/tokens.ts";

/** @type {import('tailwindcss').Config} */
const preset = {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        accent: colors.accent,
        up: colors.up,
        down: colors.down,
        status: colors.status,
        gray,
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "-apple-system", "sans-serif"],
      },
      spacing: {
        touch: `${touchTarget}px`,
      },
      borderRadius: {
        card: `${radius.card}px`,
        button: `${radius.button}px`,
      },
    },
  },
  plugins: [],
};

export default preset;

