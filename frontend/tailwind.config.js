/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#111111",
        accent: "#facc15",
        accentHover: "#eab308",
        glow: "#fde68a",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0,0,0,0.45)",
        float: "0 10px 30px rgba(0,0,0,0.38)",
        glow: "0 0 0 3px rgba(250,204,21,0.18), 0 0 30px rgba(250,204,21,0.14)"
      },
      borderRadius: {
        xl2: "20px"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-dot": {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.45" },
          "50%": { transform: "translateY(-4px)", opacity: "0.95" }
        },
        "shimmer": {
          "0%": { backgroundPosition: "0% 0" },
          "100%": { backgroundPosition: "140% 0" }
        }
      },
      animation: {
        "fade-up": "fade-up 260ms cubic-bezier(.22,1,.36,1) both",
        "pulse-dot": "pulse-dot 1.05s ease-in-out infinite",
        "shimmer": "shimmer 1.25s linear infinite"
      }
    }
  },
  plugins: []
};

