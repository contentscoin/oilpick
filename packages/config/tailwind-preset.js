// Shared Tailwind preset for OilPick apps.
// Design tokens per docs/spec/03-frontend.md "디자인 토큰" 절.
// packages/ui will own the canonical token source (T6); this preset is a
// placeholder wiring so Tailwind-based apps (admin) can consume the same values now.

/** @type {import('tailwindcss').Config} */
const preset = {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1B7A43",
          dark: "#145C32",
          light: "#E8F5EE",
        },
        accent: {
          DEFAULT: "#F5A623",
          light: "#FFF4E0",
        },
        up: "#E5484D",
        down: "#3B82F6",
        status: {
          wait: "#8B8B8B",
          active: "#3B82F6",
          done: "#1B7A43",
          danger: "#E5484D",
        },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "-apple-system", "sans-serif"],
      },
      spacing: {
        touch: "48px",
      },
      borderRadius: {
        card: "16px",
        button: "12px",
      },
    },
  },
  plugins: [],
};

export default preset;

