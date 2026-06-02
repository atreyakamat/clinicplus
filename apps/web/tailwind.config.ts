import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'clinic-green': '#1FA971',
        'clinic-blue': '#2563EB',
        'clinic-dark': '#0B0F14',
        'clinic-card': '#1F2937',
      },
      borderRadius: {
        xl: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        subtle: '0px 2px 8px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}

export default config
