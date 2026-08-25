import { test, expect, _electron as electron } from '@playwright/test';
import { electronExecutablePath, desktopAppPath, isolatedFixturePath } from './helpers.js';

test('V3 opens a Qt fixture and renders enhanced preview', async () => {
  test.skip(process.env.QT_UI_COPILOT_E2E !== '1', 'Requires explicit E2E qualification.');
  test.setTimeout(180_000);
  const app = await electron.launch({ executablePath: electronExecutablePath(), args: [desktopAppPath], env: { ...process.env, QT_UI_COPILOT_V2: '' } });
  try {
    const window = await app.firstWindow(); const fixture = await isolatedFixturePath('qt6-app');
    await window.evaluate((root) => window.dispatchEvent(new CustomEvent('v3:open-workspace', { detail: root })), fixture);
    await expect(window.getByRole('treeitem', { name: /Settings\.ui/ })).toBeVisible({ timeout: 30_000 });
    await window.getByRole('treeitem', { name: /Settings\.ui/ }).dblclick();
    await window.getByRole('button', { name: '增强预览' }).click();
    await expect(window.getByRole('img', { name: '增强 Qt 预览' })).toBeVisible({ timeout: 120_000 });
  } finally { await app.close(); }
});
