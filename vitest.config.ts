import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.nuxt/**', '.output/**', 'output/**'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['app/domain/**/*.ts', 'app/infrastructure/**/*.ts'],
    },
  },
})
