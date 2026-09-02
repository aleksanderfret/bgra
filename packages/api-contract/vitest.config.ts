import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure contract logic: no DOM needed, so keep the fast Node environment.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
