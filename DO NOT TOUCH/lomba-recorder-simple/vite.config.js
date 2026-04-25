import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/lomba-recorder/simple/',
  build: {
    outDir: '../../lomba-recorder/simple',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': {
        target: 'https://drmbl.site',
        changeOrigin: true,
      },
    },
  },
})
