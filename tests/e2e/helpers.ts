import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const fixturePath = (name: string): string => path.resolve(process.cwd(), 'fixtures', name);

export async function importProject(window: Page, root: string): Promise<void> {
  await window.getByLabel('项目目录').fill(root);
  await window.getByRole('button', { name: '导入项目' }).click();
  await expect(window.getByText(/\.ui$/).first()).toBeVisible();
  await window.getByRole('button', { name: /NetworkSettings\.ui$/ }).click();
}

export async function requestChange(window: Page, request: string): Promise<void> {
  await window.getByLabel('界面需求').fill(request);
  await window.getByRole('button', { name: '生成修改计划' }).click();
}

export async function chooseComponent(window: Page, componentId: string): Promise<void> {
  await window.getByTestId(`component-${componentId}`).click();
}

export async function approvePlan(window: Page): Promise<void> {
  await window.getByRole('button', { name: '批准计划' }).click();
}
