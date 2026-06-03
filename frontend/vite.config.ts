import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow')) return 'vendor-flow';
            if (id.includes('react') || id.includes('router')) return 'vendor-react';
            return 'vendor';
          }
          if (id.includes('WorkflowBuilder')) return 'workflow-builder';
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    globals: true,
  },
})
