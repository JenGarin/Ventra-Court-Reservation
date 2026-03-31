import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = String(env.VITE_API_PROXY_TARGET || 'http://localhost:54321').trim()

  return {
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used - do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      proxy: {
        // Local-dev convenience: keep `VITE_API_BASE_URL=/api/v1` and proxy to the Supabase edge function.
        // Set `VITE_API_PROXY_TARGET` to override (default: http://localhost:54321).
        '/api/v1': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/v1/, '/functions/v1/server/api/v1'),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: false,
    },
  }
})
