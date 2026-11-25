import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        reapmind: {
          blue: "#1a69fd",
          "blue-hover": "#0c4fcb",
          "blue-subtle": "rgba(26, 105, 253, 0.12)",
          yellow: "#ffff37",
          "yellow-soft": "#fdf073",
          obsidian: "#000000",
          header: "#0f0f0f",
          elevated: "#14161a",
          card: "#181a20",
          border: "rgba(255, 255, 255, 0.08)",
          "border-strong": "rgba(255, 255, 255, 0.18)",
          muted: "#888886",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
