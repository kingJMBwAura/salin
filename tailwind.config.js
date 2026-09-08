/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The inside of a machine: every neutral carries a blue undertone.
        ink: "#05080C",
        surface: "#0A1017",
        raised: "#101A24",
        line: "#1B2A38",
        line2: "#273D50",
        text: "#DCEEF7",
        muted: "#7E97A8",
        faint: "#52697A",
        // One electric cyan carries the whole app — the light-cycle colour.
        neon: "#35E7FF",
        neondim: "#0E6E80",
        // Mint means "copied, untouched"; flare means something went wrong.
        mint: "#4FE3B0",
        flare: "#FF4F79",
      },
      fontFamily: {
        // System faces only — Salin must work with no network at all.
        display: ["Avenir Next", "Futura", "system-ui", "Segoe UI", "sans-serif"],
        sans: ["system-ui", "-apple-system", "SF Pro Text", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      maxWidth: { measure: "68ch" },
    },
  },
  plugins: [],
};
