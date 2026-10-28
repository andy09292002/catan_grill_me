import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /<repo>/, so built asset paths are relative.
export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
