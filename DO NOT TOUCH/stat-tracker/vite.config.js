import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../')

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// Serves the project root files (live-game.html, css/, js/, etc.) during dev
function serveProjectRoot() {
  return {
    name: 'serve-project-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Let Vite and the proxy handle these
        if (req.url.startsWith('/tracker') || req.url.startsWith('/api')) {
          return next()
        }
        const filePath = path.join(projectRoot, req.url)
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath)
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        } catch {}
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveProjectRoot()],
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
