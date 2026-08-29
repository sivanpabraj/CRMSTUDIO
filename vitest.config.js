import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportOnFailure: true,
      include: [
        'js/lib/**/*.js',
        'js/sync/**/*.js',
        'scripts/lib/**/*.mjs',
        'js/finance-sync.js',
        'js/{domain-api,erp-runtime}.js',
        'js/{auth,cloud,password-reset,unified-login}.js',
        'supabase/functions/_shared/**/*.js',
        'supabase/functions/*/index.ts'
      ],
      thresholds: {
        'js/lib/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'js/sync/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'scripts/lib/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'js/finance-sync.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'js/{domain-api,erp-runtime}.js': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'js/lib/finance-*.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'js/{auth,cloud,password-reset,unified-login}.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'js/lib/{contract-render-security,csrf,secure-db-policy,security-paths,signed-proof,snapshot-sanitize,studio-mutate-client}.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'supabase/functions/_shared/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'supabase/functions/*/index.ts': { statements: 90, branches: 90, functions: 90, lines: 90 }
      }
    }
  },
})
