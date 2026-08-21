import { ipcMain, type BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { scanProject } from '@qt-ui-copilot/project-core';

const ImportProjectSchema = z.object({ rootDir: z.string().min(1).max(4096) }).strict();
const StartTaskSchema = z.object({ projectId: z.string().min(1), targetUi: z.string().min(1), requirement: z.string().min(1).max(10_000) }).strict();
const TaskIdSchema = z.object({ taskId: z.string().min(1) }).strict();
const ApprovalSchema = TaskIdSchema.extend({ approved: z.boolean() }).strict();
const ComponentSearchSchema = z.object({ projectId: z.string().min(1), query: z.string().max(10_000) }).strict();
const ReportSchema = z.object({ task: z.object({ taskId: z.string().min(1), targetUi: z.string().min(1), status: z.string().min(1), node: z.string().min(1), plan: z.object({ summary: z.string(), operations: z.array(z.unknown()), expectedResults: z.array(z.string()) }).passthrough().optional(), xmlBefore: z.string().max(2_000_000).optional(), xmlAfter: z.string().max(2_000_000).optional(), beforeImage: z.string().max(4_000_000).optional(), afterImage: z.string().max(4_000_000).optional(), deterministicFindings: z.array(z.string()), visualFindings: z.array(z.string()), routeEvidence: z.array(z.string()), qtKit: z.string().optional(), build: z.object({ executable: z.string(), args: z.array(z.string()), exitCode: z.number().optional() }).optional() }).passthrough(), selectedComponent: z.object({ component: z.object({ id: z.string(), name: z.string(), sourceUiFile: z.string() }).passthrough() }).passthrough().optional() }).strict();

export interface DesktopBackend {
  importProject(input: z.infer<typeof ImportProjectSchema>): Promise<unknown>;
  startTask(input: z.infer<typeof StartTaskSchema>): Promise<unknown>;
  approveTask(input: z.infer<typeof ApprovalSchema>): Promise<unknown>;
  cancelTask(input: z.infer<typeof TaskIdSchema>): Promise<unknown>;
  takeOverTask(input: z.infer<typeof TaskIdSchema>): Promise<void>;
  acceptTask(input: z.infer<typeof TaskIdSchema>): Promise<unknown>;
  rollbackTask(input: z.infer<typeof TaskIdSchema>): Promise<unknown>;
  searchComponents(input: z.infer<typeof ComponentSearchSchema>): Promise<unknown>;
}

const escapeHtml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const image = (source: string | undefined, title: string): string => source?.startsWith('data:image/') ? `<figure><img alt="${escapeHtml(title)}" src="${source}"><figcaption>${escapeHtml(title)}</figcaption></figure>` : '';

/** A deliberately small Main-process boundary. Renderer data is validated before every backend call. */
export function registerIpc(window: BrowserWindow, backend: DesktopBackend): void {
  ipcMain.handle('projects:import', (_event, input: unknown) => backend.importProject(ImportProjectSchema.parse(input)));
  ipcMain.handle('tasks:start', (_event, input: unknown) => backend.startTask(StartTaskSchema.parse(input)));
  ipcMain.handle('tasks:approve', (_event, input: unknown) => backend.approveTask(ApprovalSchema.parse(input)));
  ipcMain.handle('tasks:cancel', (_event, input: unknown) => backend.cancelTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:takeOver', (_event, input: unknown) => backend.takeOverTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:accept', (_event, input: unknown) => backend.acceptTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:rollback', (_event, input: unknown) => backend.rollbackTask(TaskIdSchema.parse(input)));
  ipcMain.handle('components:search', (_event, input: unknown) => backend.searchComponents(ComponentSearchSchema.parse(input)));
  ipcMain.handle('reports:export', async (_event, input: unknown) => {
    const request = ReportSchema.parse(input); const { task, selectedComponent } = request;
    const selected = selectedComponent?.component;
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Qt UI Copilot 证据报告</title><style>body{font:14px sans-serif;max-width:1100px;margin:24px auto}pre{white-space:pre-wrap;background:#f4f4f5;padding:12px}img{max-width:48%;border:1px solid #ccc}section{margin:18px 0}</style><h1>Qt UI Copilot 证据报告</h1><section><h2>任务</h2><p>目标：${escapeHtml(task.targetUi)}<br>最终状态：${escapeHtml(task.status)} / ${escapeHtml(task.node)}<br>Qt Kit：${escapeHtml(task.qtKit ?? '未记录')}</p></section><section><h2>需求与计划</h2><p>${escapeHtml(task.plan?.summary ?? '未记录')}</p><pre>${escapeHtml(JSON.stringify(task.plan?.operations ?? [], null, 2))}</pre></section><section><h2>复用组件</h2><p>${selected ? `${escapeHtml(selected.name)}（${escapeHtml(selected.sourceUiFile)}）` : '未选择'}</p></section><section><h2>XML Diff</h2><h3>修改前</h3><pre>${escapeHtml(task.xmlBefore ?? '')}</pre><h3>修改后</h3><pre>${escapeHtml(task.xmlAfter ?? '')}</pre></section><section><h2>运行截图</h2>${image(task.beforeImage, '修改前真实截图')}${image(task.afterImage, '修改后真实截图')}</section><section><h2>检查结果</h2><pre>${escapeHtml(JSON.stringify({ deterministic: task.deterministicFindings, visual: task.visualFindings, route: task.routeEvidence, build: task.build }, null, 2))}</pre></section></html>`;
    const result = await dialog.showSaveDialog(window, { title: '导出证据报告', defaultPath: `qt-ui-copilot-${basename(task.targetUi)}.html`, filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (result.canceled || !result.filePath) return { cancelled: true };
    await writeFile(resolve(result.filePath), html, 'utf8'); return { cancelled: false, path: result.filePath };
  });
}

/** Publishes only validated, app-owned workflow snapshots to subscribed renderer windows. */
export function publishWorkflow(window: BrowserWindow, state: unknown): void { window.webContents.send('workflow:event', state); }

export function createLocalBackend(): DesktopBackend {
  return {
    async importProject({ rootDir }) { const inventory = scanProject(rootDir); return { id: rootDir, rootDir: inventory.rootDir, uiFiles: inventory.uiFiles }; },
    async startTask() { throw new Error('Workflow services are not configured. Connect a project profile and model provider first.'); },
    async approveTask() { throw new Error('Workflow services are not configured.'); }, async cancelTask() { throw new Error('Workflow services are not configured.'); }, async takeOverTask() { throw new Error('Runtime navigation is not configured.'); }, async acceptTask() { throw new Error('Workflow services are not configured.'); }, async rollbackTask() { throw new Error('Workflow services are not configured.'); }, async searchComponents() { return []; },
  };
}
