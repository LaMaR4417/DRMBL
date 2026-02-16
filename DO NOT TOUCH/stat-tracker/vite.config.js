import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/tracker/',
  build: {
    outDir: '../../tracker',
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'https://drmbl.site',
        changeOrigin: true,
      },
    },
  },
})
