import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/l3x3-recorder/simple/',
  build: {
    outDir: '../../l3x3-recorder/simple',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5176,
    proxy: {
      '/api': {
        target: 'https://drmbl.site',
        changeOrigin: true,
      },
    },
  },
})
