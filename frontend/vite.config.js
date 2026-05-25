import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'https://atharvark07-codesentinel-ai.hf.space'

  return {
    plugins: [react()],

    // Dev server config
    server: {
      port: 5173,
      proxy: {
        // Proxy all /api requests to the FastAPI backend during development
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // Build optimization
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('react-syntax-highlighter')) return 'syntax-highlight'
            if (id.includes('lucide-react'))             return 'icons'
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  }
})
