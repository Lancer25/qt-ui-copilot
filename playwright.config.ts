import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  // The Electron main bundle is compiled with the same renderer URL that the
  // setup server exposes. Without this hook, direct Electron E2E launches a
  // BrowserWindow with no renderer and all UI locators fail before workflow
  // diagnostics can be collected.
  globalSetup: './tests/e2e/global-setup.ts',
});
