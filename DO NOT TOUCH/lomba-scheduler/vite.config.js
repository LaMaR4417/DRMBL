import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/lomba-recorder/scheduler/',
  build: {
    outDir: '../../lomba-recorder/scheduler',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5180,
    proxy: {
      '/api': {
        target: 'https://drmbl.site',
        changeOrigin: true,
      },
    },
  },
})
