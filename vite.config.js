import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')
  const input = {
    site: resolve(__dirname, 'site.html'),
    start: resolve(__dirname, 'start.html'),
    main: resolve(__dirname, 'index.html'),
    join: resolve(__dirname, 'join.html'),
    customerLogin: resolve(__dirname, 'customer-login.html'),
    contract: resolve(__dirname, 'contract.html'),
    customer: resolve(__dirname, 'customer.html'),
    studioM: resolve(__dirname, 'studio-m/index.html'),
    studioMAuthCallback: resolve(__dirname, 'studio-m/auth-callback.html')
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
