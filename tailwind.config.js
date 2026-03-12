/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark trading terminal palette
        bg: {
          primary: "#0a0e1a",
          secondary: "#111827",
          card: "#1a2235",
          hover: "#1e2a40",
        },
        border: {
          subtle: "#1e2d45",
          DEFAULT: "#243450",
        },
        accent: {
          blue: "#3b82f6",
          cyan: "#06b6d4",
        },
        signal: {
          buy: "#22c55e",
          "strong-buy": "#16a34a",
          sell: "#ef4444",
          "strong-sell": "#dc2626",
          hold: "#eab308",
          neutral: "#6b7280",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
