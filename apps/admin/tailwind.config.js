import oilpickPreset from "@oilpick/config/tailwind-preset.js";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [oilpickPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
