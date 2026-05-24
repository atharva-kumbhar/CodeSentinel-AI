/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary dark palette (GitHub Dark / Linear inspired)
        dark: {
          50:  '#f0f0f4',
          100: '#d8d8e8',
          200: '#a0a0c0',
          300: '#7070a0',
          400: '#505080',
          500: '#383870',
          600: '#242450',
          700: '#161630',
          800: '#0e0e20',
          900: '#080812',
          950: '#040408',
        },
        // Accent — electric violet (Raycast / Linear)
        accent: {
          50:  '#f0edff',
          100: '#ddd5ff',
          200: '#bfaaff',
          300: '#a07dff',
          400: '#8358f8',
          500: '#6c3af0',
          600: '#5a28d8',
          700: '#481cb0',
          800: '#371490',
          900: '#280f6a',
          950: '#180840',
        },
        // Severity colors
        critical: '#ff4444',
        high:     '#ff8c00',
        medium:   '#f5c518',
        low:      '#22c55e',
        info:     '#38bdf8',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-in':   'slideIn 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow':  'spin 3s linear infinite',
        'shimmer':    'shimmer 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(108, 58, 240, 0.3)' },
          '50%':      { boxShadow: '0 0 24px 8px rgba(108, 58, 240, 0.6)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass':       '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
        'glow':        '0 0 20px rgba(108, 58, 240, 0.4)',
        'glow-critical':'0 0 16px rgba(255, 68, 68, 0.35)',
        'glow-high':   '0 0 16px rgba(255, 140, 0, 0.35)',
        'card':        '0 4px 24px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
