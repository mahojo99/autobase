import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/packaged',
  timeout: 180000,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 30000 },
});
