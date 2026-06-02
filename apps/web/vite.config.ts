import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@clinicplus/ui': resolve(__dirname, '../../packages/ui/src'),
      '@clinicplus/shared': resolve(__dirname, '../../packages/shared/src'),
      '@clinicplus/types': resolve(__dirname, '../../packages/types/src'),
      '@clinicplus/validators': resolve(__dirname, '../../packages/validators/src'),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
})
