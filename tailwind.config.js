/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{App,index}.tsx",
    "./{components,services}/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} 