/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#994f30",
          dark: "#7d3e27",
        },
        autumn: {
          canvas: "#f5ede1",
          surface: "#fffcf7",
          soft: "#eee2d0",
          muted: "#e6d5bd",
          hover: "#dbc3a2",
          sand: "#dbc6a9",
          taupe: "#977855",
          ink: "#39291f",
          body: "#594333",
          secondary: "#75604a",
          border: "#dfcdb5",
          line: "#b89a75",
          shadow: "#5a3924",
          overlay: "#33261d",
        },
        // Muted botanical accents retain the app's status/category distinctions.
        emerald: { 100: "#e5ead8", 200: "#d0dabc", 300: "#b8c99b", 400: "#91a771", 500: "#627e46", 600: "#526c3c", 700: "#425a31", 800: "#354a28", 950: "#1e2b17" },
        sky: { 100: "#e0ebea", 200: "#c4d9d5", 300: "#9abeb8", 400: "#78a59e", 500: "#4f817c", 600: "#386d68", 700: "#2e5b56", 800: "#264c48", 950: "#152f2c" },
        violet: { 100: "#eee3e8", 200: "#dfcbd6", 300: "#c6a6b9", 400: "#b78da6", 500: "#976781", 600: "#7d506a", 700: "#684159", 800: "#57364b", 950: "#321e2b" },
        lime: { 100: "#eff0df", 200: "#dfe3bf", 300: "#ced4a5", 400: "#b7c085", 500: "#8e9d5d", 600: "#6e7d43", 700: "#586636", 800: "#46522b", 950: "#29301a" },
        pink: { 100: "#f6e7df", 200: "#eed4c5", 300: "#dbb59f", 400: "#c9987b", 500: "#b87a5b", 600: "#995f44", 700: "#7b4b36", 800: "#683e2c", 950: "#3d231a" },
        amber: { 100: "#f7eaca", 200: "#edd8a8", 300: "#d8b36d", 400: "#c89749", 500: "#a8732d", 600: "#976124", 700: "#7d4f20", 800: "#69421d", 950: "#38210d" },
      },
    },
  },
  plugins: [],
};

