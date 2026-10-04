import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // The JobLanders palette, the same one the decks and joblanders.ai use:
      // warm paper, near-black ink, and exactly one accent colour.
      colors: {
        bg: {
          DEFAULT: '#FBFAF7', // paper
          elevated: '#F2F0EA', // table heads, chips
          card: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E4E1D8',
          strong: '#CFCBBF',
        },
        ink: {
          DEFAULT: '#111114',
          soft: '#4A4A52',
          mute: '#6E6E78',
          faint: '#9A9AA3',
        },
        brand: {
          DEFAULT: '#FF009B',
          hover: '#D60083',
          wash: '#FFE8F5',
        },
        success: '#047857',
        danger: '#BE123C',
        warning: '#B45309',
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'Archivo', 'Helvetica Neue', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
