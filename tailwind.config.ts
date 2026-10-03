import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Joblanders dark palette
        bg: {
          DEFAULT: '#0b0d12',
          elevated: '#12151c',
          card: '#161a23',
        },
        border: {
          DEFAULT: '#232834',
          strong: '#2f3545',
        },
        brand: {
          DEFAULT: '#6366f1',
          hover: '#7c7ff5',
        },
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        muted: '#8a92a6',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
