/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '420px',
      },
      colors: {
        cine: {
          bg: '#07090e',
          card: '#0f141f',
          cardHover: '#161e2e',
          border: '#1e293b',
          borderLight: '#334155',
          cyan: '#0ea5e9',
          royal: '#2563eb',
          purple: '#8b5cf6',
          gold: '#f59e0b',
          red: '#ef4444',
          muted: '#94a3b8',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 20px -3px rgba(14, 165, 233, 0.45)',
        'neon-blue': '0 0 20px -3px rgba(37, 99, 235, 0.45)',
        'neon-gold': '0 0 20px -3px rgba(245, 158, 11, 0.45)',
        'neon-warning': '0 0 15px 0px rgba(245, 158, 11, 0.6)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulseGlow 2s infinite',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { 
            boxShadow: '0 0 0px rgba(245, 158, 11, 0)',
            borderColor: 'rgba(245, 158, 11, 0.3)' 
          },
          '50%': { 
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.6)',
            borderColor: 'rgba(245, 158, 11, 0.9)' 
          },
        },
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
