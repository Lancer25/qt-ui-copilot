import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
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

export async function fixtureSourceDigest(name: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (directory: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'build' || entry.name === 'preview-cache' || entry.name === 'tasks') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        hash.update(path.relative(fixturePath(name), absolute).replaceAll('\\', '/'));
        hash.update(await readFile(absolute));
      }
    }
  };
  await visit(fixturePath(name));
  return hash.digest('hex');
}

/**
 * Make a disposable copy of a fixture before running a workflow that can
 * accept a candidate patch. The desktop app intentionally writes accepted
 * changes into the imported project, so E2E must never point at the checked
 * in fixture. The generated directory is ignored by git and is safe to
 * remove between runs.
 */
export async function isolatedFixturePath(name: string): Promise<string> {
  const generatedRoot = path.join(workspaceRoot, 'test-results', 'generated-fixtures');
  const targetRoot = path.join(generatedRoot, name);
  await cp(fixturePath(name), targetRoot, { recursive: true, force: true });

  // The Qt6 fixture reuses the Qt5 fixture's sources and resources. Copy its
  // sibling beside the generated Qt6 project so relative CMake paths remain
  // valid without reaching into the live fixture tree.
  if (name === 'qt6-app') {
    await cp(fixturePath('qt59-app'), path.join(generatedRoot, 'qt59-app'), { recursive: true, force: true });
  }

  const profilePath = path.join(targetRoot, '.qt-ui-copilot', 'project.json');
  const nativeProbe = path.join(workspaceRoot, 'native', 'qt-ui-probe').replaceAll('\\', '/');
  if (existsSync(profilePath)) {
    const profile = JSON.parse(await readFile(profilePath, 'utf8')) as {
      preview?: { sourceDirectory?: string; qrcFiles?: string[]; stylesheets?: string[] };
    };
    const nativePreview = path.join(workspaceRoot, 'native', 'qt-ui-preview-host').replaceAll('\\', '/');
    if (profile.preview) {
      profile.preview.sourceDirectory = nativePreview;
      if (name === 'qt6-app') {
        const copiedResources = path.join(generatedRoot, 'qt59-app', 'resources').replaceAll('\\', '/');
        profile.preview.qrcFiles = [`${copiedResources}/common.qrc`];
        profile.preview.stylesheets = [`${copiedResources}/dark.qss`];
      }
    }
    await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    // The fixture CMake files refer to ../../native from the checked-in
    // layout. In test-results that path points inside test-results, so make
    // the probe source explicit in the disposable copy.
  }
  const cmakePath = path.join(targetRoot, 'CMakeLists.txt');
  if (existsSync(cmakePath)) {
    const cmake = await readFile(cmakePath, 'utf8');
    await writeFile(cmakePath, cmake.replaceAll('${CMAKE_CURRENT_LIST_DIR}/../../native/qt-ui-probe', nativeProbe), 'utf8');
  }
  return targetRoot;
}

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
    const approvalState = await window.getByRole('button', { name: '批准并应用候选修改' }).evaluate((element) => ({
      workflowStatus: element.getAttribute('data-workflow-status'),
      workflowNode: element.getAttribute('data-workflow-node'),
      hasPlan: element.getAttribute('data-has-plan'),
      canApply: element.getAttribute('data-can-apply'),
      revision: element.getAttribute('data-workflow-revision'),
      ariaDisabled: element.getAttribute('aria-disabled'),
      disabled: (element as HTMLButtonElement).disabled,
    })).catch(() => ({ workflowStatus: '<unavailable>', workflowNode: '<unavailable>', hasPlan: '<unavailable>', canApply: '<unavailable>', revision: '<unavailable>', ariaDisabled: '<unavailable>', disabled: '<unavailable>' }));
    const body = (await textOf(window.locator('body'))).replace(/\s+/g, ' ').slice(0, 1600);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nApproval diagnostics: state=${JSON.stringify(approvalState)}; timeline=${timeline}; alert=${alert}; body=${body}`);
  }
  await button.click();
}
