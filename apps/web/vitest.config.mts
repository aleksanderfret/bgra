import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/{app,features,i18n,lib}/**/*.test.{ts,tsx}'],
    // Server Components are not renderable outside a Next request; those paths
    // are covered end-to-end instead of in unit tests.
    exclude: ['node_modules/**', '.next/**'],
  },
});
