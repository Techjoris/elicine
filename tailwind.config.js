/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        inter: ['Inter', '"Plus Jakarta Sans"', 'sans-serif'],
      },
      screens: {
        'xs': '420px',
      },
      colors: {
        cine: {
          bg: '#0a0a0a',
          card: '#121212',
          cardHover: '#181818',
          border: 'rgba(255, 255, 255, 0.08)',
          borderLight: 'rgba(255, 255, 255, 0.16)',
          accent: '#e50914',
          accentHover: '#b80710',
          muted: '#a1a1aa',
          gold: '#d4af37',
        }
      },
      boxShadow: {
        'cinema': '0 20px 40px -15px rgba(0, 0, 0, 0.9)',
        'subtle': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.65)',
        'neon-cyan': '0 10px 25px -5px rgba(0, 0, 0, 0.8)',
        'neon-blue': '0 10px 25px -5px rgba(0, 0, 0, 0.8)',
        'neon-gold': '0 10px 25px -5px rgba(0, 0, 0, 0.8)',
        'neon-warning': '0 10px 25px -5px rgba(0, 0, 0, 0.8)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
