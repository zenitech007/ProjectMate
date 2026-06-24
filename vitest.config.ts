import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['services/**/*.test.ts', 'components/**/*.test.ts'],
  },
});
