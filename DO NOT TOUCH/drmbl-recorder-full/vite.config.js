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
        if (req.url.startsWith('/drmbl-recorder') || req.url.startsWith('/api')) {
          return next()
        }
        const urlPath = req.url.split('?')[0]
        const filePath = path.join(projectRoot, urlPath)
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

// Mirrors the built index.html to /drmbl-recorder/all-star/ after every build.
// That path is the dedicated All-Star entry: same bundle (assets load from the
// absolute /drmbl-recorder/full/assets/ URLs), and App.jsx switches into
// All-Star mode by pathname. A real file is required — vercel.json rewrites
// can't target *.html destinations while cleanUrls is on.
function copyAllStarEntry() {
  return {
    name: 'copy-all-star-entry',
    closeBundle() {
      const src = path.resolve(projectRoot, 'drmbl-recorder/full/index.html')
      const destDir = path.resolve(projectRoot, 'drmbl-recorder/all-star')
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(src, path.join(destDir, 'index.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveProjectRoot(), copyAllStarEntry()],
  base: '/drmbl-recorder/full/',
  build: {
    outDir: '../../drmbl-recorder/full',
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
