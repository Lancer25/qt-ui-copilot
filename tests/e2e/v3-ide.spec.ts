import { test, expect, _electron as electron } from '@playwright/test';
import { desktopAppPath, electronExecutablePath } from './helpers.js';

test.describe('V3 IDE shell', () => {
  test.skip(process.env.QT_UI_COPILOT_E2E !== '1', 'Requires explicit E2E qualification.');
  test('renders the V3 Explorer, UI editor and AI assistant by default', async () => {
    const app = await electron.launch({ executablePath: electronExecutablePath(), args: [desktopAppPath], env: { ...process.env, QT_UI_COPILOT_V2: '' } });
    try {
      const window = await app.firstWindow();
      await expect(window.getByLabel('项目文件')).toBeVisible();
      await expect(window.getByLabel('Qt 预览编辑器')).toBeVisible();
      await expect(window.getByLabel('AI 助手')).toBeVisible();
      await expect(window.getByRole('button', { name: '打开文件夹' })).toBeVisible();
      await expect(window.getByRole('button', { name: '专注界面' })).toBeVisible();
      await expect(window.getByRole('button', { name: '整体模式' })).toBeVisible();
    } finally { await app.close(); }
  });
});
