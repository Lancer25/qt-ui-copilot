import { test, expect, _electron as electron } from '@playwright/test';
import { approvePlan, desktopAppPath, electronExecutablePath, fixturePath, importProject, requestChange } from './helpers.js';

test.describe('qualified desktop workflow', () => {
  test.skip(process.env.QT_UI_COPILOT_E2E !== '1', 'Requires an explicitly configured local Qt kit and model endpoint.');

  test('modifies and validates the real Qt 6.10.2 app', async ({}, testInfo) => {
    const executablePath = electronExecutablePath();
    expect(executablePath).toMatch(/electron(?:\.exe)?$/i);
    const logStep = (name: string): void => console.log(`[E2E] ${name}`);
    logStep('launch Electron process');
    const electronApp = await test.step('launch Electron process', () => electron.launch({ executablePath, args: [desktopAppPath] }));
    try {
      logStep('wait for main BrowserWindow');
      const window = await test.step('wait for main BrowserWindow', () => electronApp.firstWindow());
      const diagnostics: string[] = [];
      const redact = (value: string): string => value.replace(/https?:\/\/[^\s'"<>]+/g, '<url>').replace(/(?:api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>');
      window.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') diagnostics.push(`console.${message.type()}: ${redact(message.text())}`); });
      window.on('pageerror', (error) => diagnostics.push(`pageerror: ${redact(error.message)}`));
      try {
        logStep('import Qt 6.10.2 fixture');
        await test.step('import Qt 6.10.2 fixture', () => importProject(window, fixturePath('qt6-app')));
        logStep('request structured UI change');
        await test.step('request structured UI change', () => requestChange(window, '增加测试连接按钮，并确保英文小窗口不截断'));
        logStep('choose reusable component');
        await test.step('choose reusable component', async () => {
          // Qt6 fixture currently has no required component candidate; this
          // step is retained as an explicit diagnostic boundary.
          const candidate = window.getByTestId('component-network-connection-panel');
          if (await candidate.count()) await chooseComponent(window, 'network-connection-panel');
        });
        logStep('approve candidate plan');
        await test.step('approve candidate plan', () => approvePlan(window, 15_000));
        logStep('verify runtime evidence');
        await test.step('verify runtime evidence', async () => {
          await expect(window.getByText('uic 校验通过')).toBeVisible();
          await expect(window.getByText('真实应用验证通过')).toBeVisible();
          await expect(window.getByRole('img', { name: '修改后真实截图' })).toBeVisible();
        });
      } catch (error) {
        await testInfo.attach('qt6-window-on-failure.png', { body: await window.screenshot(), contentType: 'image/png' });
        if (diagnostics.length) await testInfo.attach('qt6-console-errors.txt', { body: diagnostics.join('\n'), contentType: 'text/plain' });
        throw error;
      }
    } finally { await electronApp.close(); }
  });

  test('modifies and validates the real Qt 5.9.6 app', async () => {
    test.skip(!process.env.QT59_CMAKE_PREFIX_PATH, 'Qt 5.9.6 scenario is enabled only when QT59_CMAKE_PREFIX_PATH is configured.');
    const executablePath = electronExecutablePath();
    expect(executablePath).toMatch(/electron(?:\.exe)?$/i);
    const electronApp = await electron.launch({ executablePath, args: [desktopAppPath] });
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
