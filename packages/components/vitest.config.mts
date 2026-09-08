import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@bga-web-i18n': fileURLToPath(new URL('../../apps/web/src/i18n', import.meta.url)),
      '@bga-web-theme': fileURLToPath(new URL('../../apps/web/src/app/theme.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
