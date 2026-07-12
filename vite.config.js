import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')
  return {
    root: '.',
    envPrefix: 'VITE_',
    server: {
      port: 5173,
      open: '/site.html'
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          site: resolve(__dirname, 'site.html'),
          start: resolve(__dirname, 'start.html'),
          main: resolve(__dirname, 'index.html'),
          join: resolve(__dirname, 'join.html'),
          customerLogin: resolve(__dirname, 'customer-login.html'),
          admin: resolve(__dirname, 'admin.html'),
          contract: resolve(__dirname, 'contract.html'),
          customer: resolve(__dirname, 'customer.html'),
          studioM: resolve(__dirname, 'studio-m/index.html'),
          studioMAuthCallback: resolve(__dirname, 'studio-m/auth-callback.html')
        }
      }
    },
    optimizeDeps: {
      include: ['@supabase/supabase-js']
    }
  }
})
