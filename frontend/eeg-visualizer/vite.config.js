import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Docker + Codespaces friendly:
  // - bind to all interfaces
  // - proxy backend requests so the frontend never needs to hard-code
  //   "http://localhost:5000" (which breaks in Codespaces).
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      // Frontend calls /api/... and Vite proxies to the backend container.
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
        // Keep /api prefix so backend can stay the same if you want.
        // If your backend endpoints are mounted at '/', we rewrite /api -> ''.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
