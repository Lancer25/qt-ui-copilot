import { test, expect, _electron as electron } from '@playwright/test';
import { approvePlan, chooseComponent, fixturePath, importProject, requestChange } from './helpers.js';

test.describe('qualified desktop workflow', () => {
  test.skip(process.env.QT_UI_COPILOT_E2E !== '1', 'Requires an explicitly configured local Qt kit and model endpoint.');

  test('reuses a component and validates it in the real Qt 5.9.6 app', async () => {
    const electronApp = await electron.launch({ args: ['apps/desktop'] });
    try {
      const window = await electronApp.firstWindow();
      await importProject(window, fixturePath('qt59-app'));
      await requestChange(window, '复用连接测试组件，并确保英文小窗口不截断');
      await chooseComponent(window, 'network-connection-panel');
      await approvePlan(window);
      await expect(window.getByText('uic 校验通过')).toBeVisible();
      await expect(window.getByText('真实应用验证通过')).toBeVisible();
      await expect(window.getByRole('img', { name: '修改后真实截图' })).toBeVisible();
    } finally { await electronApp.close(); }
  });
});
