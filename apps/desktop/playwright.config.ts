import { defineConfig } from '@playwright/test';

// Keep Playwright's project-local CLI usable with
// `pnpm --filter @qt-ui-copilot/desktop exec playwright test`.
export default defineConfig({
  testDir: '../../tests/e2e',
  globalSetup: '../../tests/e2e/global-setup.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
});
