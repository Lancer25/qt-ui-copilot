import { expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');
const electronExecutableName = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron') : 'electron';

/** Resolve Electron directly; the npm wrapper needs path.txt, which may be
 * absent after a package-manager repair even when dist/electron.exe exists. */
export function electronExecutablePath(): string {
  const dist = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? path.join(workspaceRoot, 'node_modules', 'electron', 'dist');
  const executable = path.join(dist, electronExecutableName);
  if (!existsSync(executable)) throw new Error(`Electron executable is missing: ${executable}`);
  return executable;
}

export const desktopAppPath = path.join(workspaceRoot, 'apps', 'desktop');

export const fixturePath = (name: string): string => path.join(workspaceRoot, 'fixtures', name);

export async function importProject(window: Page, root: string): Promise<void> {
  const projectDirectory = window.locator('#project-directory');
  await expect(projectDirectory).toBeVisible();
  await projectDirectory.fill(root);
  await window.getByRole('button', { name: '导入项目' }).click();
  await expect(window.getByText(/\.ui$/).first()).toBeVisible();
  // The Qt6 fixture intentionally contains a reduced Settings.ui surface,
  // while the Qt5 fixture contains NetworkSettings.ui. Select the first
  // discovered .ui file so the test remains valid across both fixtures.
  await window.getByRole('button', { name: /\.ui$/ }).first().click();
}

export async function requestChange(window: Page, request: string): Promise<void> {
  await window.getByLabel('界面需求').fill(request);
  await window.getByRole('button', { name: '生成修改计划' }).click();
}

export async function chooseComponent(window: Page, componentId: string): Promise<void> {
  await window.getByTestId(`component-${componentId}`).click();
}

export async function approvePlan(window: Page, timeoutMs = 120_000): Promise<void> {
  const button = window.getByRole('button', { name: '批准并应用候选修改' });
  try {
    // The primary action deliberately keeps its native button semantics so
    // keyboard/focus automation can observe the action even while it is
    // unavailable.  Read the ARIA state instead of the native disabled flag.
    await expect(button).toHaveAttribute('aria-disabled', 'false', { timeout: timeoutMs });
  } catch (error) {
    const redact = (value: string): string => value
      .replace(/https?:\/\/[^\s'"<>]+/g, '<url>')
      .replace(/(?:api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
      .replace(/sk-[A-Za-z0-9_-]+/g, '<redacted>');
    const textOf = async (locator: ReturnType<typeof window.locator>): Promise<string> => {
      try { return redact(await locator.innerText()); } catch { return '<unavailable>'; }
    };
    const timeline = await textOf(window.locator('section[aria-label="任务执行"]'));
    const alert = await textOf(window.getByRole('alert'));
    const body = (await textOf(window.locator('body'))).replace(/\s+/g, ' ').slice(0, 1600);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nApproval diagnostics: timeline=${timeline}; alert=${alert}; body=${body}`);
  }
  await button.click();
}
