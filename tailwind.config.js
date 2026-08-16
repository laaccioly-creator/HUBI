/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hubi: {
          primary: '#10B981', // Verde esmeralda característico do HUBI
          'primary-dark': '#059669',
          'primary-light': '#D1FAE5',
          secondary: '#6366F1',
          accent: '#F59E0B',
          dark: '#0F172A',
          card: '#1E293B',
          surface: '#334155',
          background: '#0B0F17'
        }
      }
    },
  },
  plugins: [],
}
