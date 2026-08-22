import { test, expect, _electron as electron } from '@playwright/test';
import { approvePlan, fixturePath, importProject, requestChange } from './helpers.js';

test.describe('qualified desktop workflow', () => {
  test.skip(process.env.QT_UI_COPILOT_E2E !== '1', 'Requires an explicitly configured local Qt kit and model endpoint.');

  test('modifies and validates the real Qt 6.10.2 app', async () => {
    const electronApp = await electron.launch({ args: ['apps/desktop'] });
    try {
      const window = await electronApp.firstWindow();
      await importProject(window, fixturePath('qt6-app'));
      await requestChange(window, '增加测试连接按钮，并确保英文小窗口不截断');
      await approvePlan(window);
      await expect(window.getByText('uic 校验通过')).toBeVisible();
      await expect(window.getByText('真实应用验证通过')).toBeVisible();
      await expect(window.getByRole('img', { name: '修改后真实截图' })).toBeVisible();
    } finally { await electronApp.close(); }
  });

  test('modifies and validates the real Qt 5.9.6 app', async () => {
    test.skip(!process.env.QT59_CMAKE_PREFIX_PATH, 'Qt 5.9.6 scenario is enabled only when QT59_CMAKE_PREFIX_PATH is configured.');
    const electronApp = await electron.launch({ args: ['apps/desktop'] });
    try {
      const window = await electronApp.firstWindow();
      await importProject(window, fixturePath('qt59-app'));
      await requestChange(window, '增加测试连接按钮，并确保英文小窗口不截断');
      await approvePlan(window);
      await expect(window.getByText('uic 校验通过')).toBeVisible();
      await expect(window.getByText('真实应用验证通过')).toBeVisible();
      await expect(window.getByRole('img', { name: '修改后真实截图' })).toBeVisible();
    } finally { await electronApp.close(); }
  });
});
