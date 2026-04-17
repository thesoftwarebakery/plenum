import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*_test.ts'],
    globalSetup: ['./src/setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 3 },
    },
    reporters: ['verbose'],
  },
});
