import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        shell: "#f5f3ed",
        ink: "#1f2937",
        accent: "#0f766e",
        accentSoft: "#ccfbf1",
        panel: "#fffdf8",
        line: "#ded7cb"
      },
      fontFamily: {
        sans: ["var(--font-sans)"]
      },
      boxShadow: {
        card: "0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
