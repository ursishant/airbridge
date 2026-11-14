/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bento: {
          darkBg: '#0B0D13',
          darkCard: '#131620',
          darkCardHover: '#181C28',
          darkCardBorder: 'rgba(255, 255, 255, 0.08)',
          darkPill: '#FFFFFF',
          darkPillText: '#0B0D13',
          lightBg: '#F4F5F8',
          lightCard: '#FFFFFF',
          lightCardHover: '#FAFBFC',
          lightCardBorder: 'rgba(0, 0, 0, 0.06)',
          lightPill: '#0F1117',
          lightPillText: '#FFFFFF',
          blue: '#0071E3',
          blueHover: '#0077ED',
          purple: '#8B5CF6',
          green: '#10B981',
          slate: '#94A3B8',
        },
        apple: {
          canvas: '#F5F5F7',
          pure: '#FFFFFF',
          card: 'rgba(255, 255, 255, 0.82)',
          sidebar: 'rgba(245, 245, 247, 0.85)',
          blue: '#0071E3',
          blueHover: '#0077ED',
          blueSoft: '#EBF4FF',
          green: '#34C759',
          greenSoft: '#EDFDF2',
          orange: '#FF9500',
          red: '#FF3B30',
          purple: '#AF52DE',
          text: '#1D1D1F',
          secondary: '#6E6E73',
          tertiary: '#86868B',
          border: 'rgba(0, 0, 0, 0.07)',
          borderHover: 'rgba(0, 0, 0, 0.15)',
        },
        android: {
          green: '#00C853',
          dark: '#073042',
        }
      },
      fontFamily: {
        sans: [
          'Satoshi',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'Satoshi',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        'bento-sm': '0 2px 8px -1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'bento-card': '0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
        'bento-dark': '0 10px 30px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'bento-glow': '0 0 20px -2px rgba(255, 255, 255, 0.15)',
        'apple-sm': '0 2px 8px -1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'apple-card': '0 8px 30px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'apple-hover': '0 16px 40px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.03)',
        'apple-modal': '0 25px 60px -15px rgba(0, 0, 0, 0.16), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'apple-inner': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
      },
      animation: {
        'ping-slow': 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'ripple': 'ripple 2s linear infinite',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        }
      }
    },
  },
  plugins: [],
}
