import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')
  const input = {
    customerLogin: resolve(import.meta.dirname, 'customer-login.html'),
    studioMAuthCallback: resolve(import.meta.dirname, 'studio-m/auth-callback.html')
  }
  return {
    root: '.',
    envPrefix: 'VITE_',
    server: {
      host: '0.0.0.0',
      port: 5173,
      open: '/site.html'
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    },
    build: {
      outDir: 'dist',
      rollupOptions: { input }
    },
    optimizeDeps: {
      include: ['@supabase/supabase-js']
    }
  }
})
