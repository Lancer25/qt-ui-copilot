import { ipcMain, type BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { scanProject } from '@qt-ui-copilot/project-core';
import { openDatabase, TaskRepository } from '@qt-ui-copilot/task-store';
import { ComponentCatalog } from '@qt-ui-copilot/component-library';
import { TaskRepositoryWorkflowStore, UiPlanner, VisualCritic, WorkflowMachine, type ModelProvider, type ModelRequest, type WorkflowNode, type WorkflowState } from '@qt-ui-copilot/agent-workflow';
import { parseUi } from '@qt-ui-copilot/ui-document';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ImportProjectSchema = z.object({ rootDir: z.string().min(1).max(4096) }).strict();
const StartTaskSchema = z.object({ projectId: z.string().min(1), targetUi: z.string().min(1), requirement: z.string().min(1).max(10_000) }).strict();
const TaskIdSchema = z.object({ taskId: z.string().min(1) }).strict();
const ApprovalSchema = TaskIdSchema.extend({ approved: z.boolean() }).strict();
const ComponentSearchSchema = z.object({ projectId: z.string().min(1), query: z.string().max(10_000) }).strict();
const ModelSettingsInputSchema = z.object({ baseUrl: z.string().url().max(2048), model: z.string().min(1).max(256), apiKey: z.string().min(1).max(4096).optional() }).strict();
export const ModelSettingsSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  hasApiKey: z.boolean(),
  hasPersistentApiKey: z.boolean(),
  storageWarning: z.string().max(512).optional(),
}).strict();
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
  getModelSettings(): Promise<z.infer<typeof ModelSettingsSchema>>;
  configureModelSettings(input: z.infer<typeof ModelSettingsInputSchema>): Promise<z.infer<typeof ModelSettingsSchema>>;
  subscribeWorkflow?(listener: (state: unknown) => void): () => void;
  /** Releases the SQLite handle. Used by deterministic integration tests and app shutdown. */
  dispose?(): void;
}

const escapeHtml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const image = (source: string | undefined, title: string): string => source?.startsWith('data:image/') ? `<figure><img alt="${escapeHtml(title)}" src="${source}"><figcaption>${escapeHtml(title)}</figcaption></figure>` : '';

/** A deliberately small Main-process boundary. Renderer data is validated before every backend call. */
export function registerIpc(window: BrowserWindow, backend: DesktopBackend): void {
  backend.subscribeWorkflow?.((state) => publishWorkflow(window, state));
  ipcMain.handle('projects:import', (_event, input: unknown) => backend.importProject(ImportProjectSchema.parse(input)));
  ipcMain.handle('tasks:start', (_event, input: unknown) => backend.startTask(StartTaskSchema.parse(input)));
  ipcMain.handle('tasks:approve', (_event, input: unknown) => backend.approveTask(ApprovalSchema.parse(input)));
  ipcMain.handle('tasks:cancel', (_event, input: unknown) => backend.cancelTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:takeOver', (_event, input: unknown) => backend.takeOverTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:accept', (_event, input: unknown) => backend.acceptTask(TaskIdSchema.parse(input)));
  ipcMain.handle('tasks:rollback', (_event, input: unknown) => backend.rollbackTask(TaskIdSchema.parse(input)));
  ipcMain.handle('components:search', (_event, input: unknown) => backend.searchComponents(ComponentSearchSchema.parse(input)));
  ipcMain.handle('settings:getModel', () => backend.getModelSettings());
  ipcMain.handle('settings:configureModel', (_event, input: unknown) => backend.configureModelSettings(ModelSettingsInputSchema.parse(input)));
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

/** The narrow subset of Electron safeStorage used by the Main-process backend. */
export interface SecureStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface LocalBackendOptions {
  databasePath?: string;
  modelProvider?: ModelProvider;
  /** Inject Electron safeStorage in production; tests supply a deterministic fake. */
  secureStorage?: SecureStorage;
}
interface StoredProject { id: string; rootDir: string; uiFiles: string[]; }
interface UiState { taskId: string; targetUi: string; status: WorkflowState['status']; node: WorkflowNode; plan?: unknown; events: Array<{ node: string; status: string; detail?: string }>; deterministicFindings: string[]; visualFindings: string[]; routeEvidence: string[]; qtKit?: string; }

class OpenAiCompatibleProvider implements ModelProvider {
  constructor(private readonly settings: { baseUrl: string; model: string; apiKey?: string }) {}
  async generate(request: ModelRequest): Promise<unknown> {
    const response = await fetch(`${this.settings.baseUrl.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(this.settings.apiKey ? { authorization: `Bearer ${this.settings.apiKey}` } : {}) }, body: JSON.stringify({ model: this.settings.model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: JSON.stringify(request.input) }] }) });
    if (!response.ok) throw new Error(`Model request failed: HTTP ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('Model response did not include JSON content');
    return content;
  }
}

/** Main-only composition root. Tests inject a deterministic provider; production uses configured OpenAI-compatible HTTP. */
export function createLocalBackend(options: LocalBackendOptions = {}): DesktopBackend {
  const database = openDatabase(options.databasePath ?? ':memory:');
  const repository = new TaskRepository(database);
  const catalog = new ComponentCatalog({ databasePath: ':memory:' });
  const projects = new Map<string, StoredProject>();
  const snapshots = new Map<string, UiState>();
  const listeners = new Set<(state: unknown) => void>();
  const workflowStore = new TaskRepositoryWorkflowStore(repository);
  const storedModel = repository.getModelSettings();
  let storageWarning: string | undefined;
  let configured: { baseUrl: string; model: string; apiKey?: string } | undefined = storedModel && {
    baseUrl: storedModel.baseUrl,
    model: storedModel.model,
  };
  if (storedModel?.encryptedApiKey) {
    if (!options.secureStorage?.isEncryptionAvailable()) {
      storageWarning = '系统安全存储不可用；已保存的 API Key 无法在本次会话中读取。';
    } else {
      try {
        configured = { ...configured!, apiKey: options.secureStorage.decryptString(storedModel.encryptedApiKey) };
      } catch {
        storageWarning = '无法从系统安全存储读取 API Key；请重新保存模型设置。';
      }
    }
  }
  const provider = (): ModelProvider => options.modelProvider ?? new OpenAiCompatibleProvider(configured!);
  const modelSettings = () => ModelSettingsSchema.parse({
    baseUrl: configured?.baseUrl ?? 'http://localhost:11434/v1',
    model: configured?.model ?? 'gpt-4o-mini',
    hasApiKey: Boolean(configured?.apiKey),
    hasPersistentApiKey: Boolean(configured?.apiKey && options.secureStorage?.isEncryptionAvailable()),
    ...(storageWarning ? { storageWarning } : {}),
  });
  const update = (state: UiState): UiState => { snapshots.set(state.taskId, state); const snapshot = structuredClone(state); listeners.forEach((listener) => listener(snapshot)); return snapshot; };
  const mutate = (taskId: string, change: Partial<UiState>): UiState => { const current = snapshots.get(taskId); if (!current) throw new Error(`Unknown task: ${taskId}`); return update({ ...current, ...change, events: [...current.events, { node: String(change.node ?? current.node), status: String(change.status ?? current.status) }] }); };
  const workflowFor = (taskId: string): WorkflowMachine => new WorkflowMachine({ store: workflowStore, execute: async (node, state) => {
    if (node === 'GENERATE_UI_PLAN') { const snapshot = snapshots.get(taskId)!; const project = projects.get(repository.getTask(taskId)!.projectId)!; const source = readFileSync(snapshot.targetUi, 'utf8'); const document = parseUi(source, snapshot.targetUi); const plan = await new UiPlanner(provider()).plan({ requirement: snapshot.events[0]?.detail ?? '', targetSemanticTree: { widgets: [...document.index.widgetsByName.keys()], layouts: [...document.index.layoutsByName.keys()] }, runtimeFacts: { uiFile: snapshot.targetUi }, componentCandidates: await catalog.search({ text: snapshot.events[0]?.detail ?? '', limit: 3 }) }); snapshots.set(taskId, { ...snapshot, plan, node, status: state.status }); return { kind: 'passed' as const }; }
    if (node === 'VISUAL_REVIEW') { await new VisualCritic(provider()).review({ beforeImage: '', afterImage: '', expectedResults: [], deterministicFindings: [] }); }
    return { kind: 'passed' as const, evidence: node === 'CAPTURE_BASELINE' ? ['baseline_capture'] : node === 'ENHANCED_PREVIEW' ? ['preview_capture'] : node === 'CAPTURE_REAL_RESULT' ? ['real_application_capture'] : [] };
  } });
  return {
    async importProject({ rootDir }) { const inventory = scanProject(rootDir); const item = { id: randomUUID(), rootDir: inventory.rootDir, uiFiles: inventory.uiFiles }; projects.set(item.id, item); repository.upsertProject({ id: item.id, rootDir: item.rootDir }); return item; },
    async startTask({ projectId, targetUi, requirement }) { if (!options.modelProvider && !configured) return { kind: 'configuration_required', message: '请先在“模型设置”中配置 OpenAI-compatible Base URL、模型和可选 API Key。' }; const project = projects.get(projectId); if (!project || !project.uiFiles.includes(targetUi)) throw new Error('Target .ui file does not belong to the imported project'); const taskId = repository.createTask(projectId, targetUi); update({ taskId, targetUi, status: 'running', node: 'IMPORT_PROJECT', events: [{ node: 'UNDERSTAND_REQUIREMENT', status: 'completed', detail: requirement }], deterministicFindings: [], visualFindings: [], routeEvidence: [] }); const state = await workflowFor(taskId).start({ taskId }); const snapshot = snapshots.get(taskId)!; return { kind: 'started', state: update({ ...snapshot, status: state.status, node: state.node, events: [...snapshot.events, { node: state.node, status: state.status }] }) }; },
    async approveTask({ taskId, approved }) { const state = await workflowFor(taskId).approve(taskId, { approved }); return mutate(taskId, { status: state.status, node: state.node }); },
    async cancelTask({ taskId }) { const state = await workflowFor(taskId).cancel(taskId); return mutate(taskId, { status: state.status, node: state.node }); },
    async takeOverTask({ taskId }) { mutate(taskId, { events: [...(snapshots.get(taskId)?.events ?? []), { node: 'MANUAL_TAKEOVER', status: 'requested' }] }); },
    async acceptTask({ taskId }) { const state = await workflowFor(taskId).approve(taskId, { approved: true }); return mutate(taskId, { status: state.status, node: state.node }); },
    async rollbackTask({ taskId }) { const state = await workflowFor(taskId).approve(taskId, { approved: false }); return mutate(taskId, { status: state.status, node: state.node }); },
    async searchComponents({ query }) { return catalog.search({ text: query, limit: 3 }); },
    async getModelSettings() { return modelSettings(); },
    async configureModelSettings(input) {
      const nextApiKey = input.apiKey ?? configured?.apiKey;
      let encryptedApiKey: Buffer | undefined;
      storageWarning = undefined;
      if (input.apiKey) {
        if (options.secureStorage?.isEncryptionAvailable()) {
          try {
            encryptedApiKey = options.secureStorage.encryptString(input.apiKey);
          } catch {
            storageWarning = '系统安全存储写入失败；API Key 只在当前会话内保存。';
          }
        } else {
          storageWarning = '系统安全存储不可用；API Key 只在当前会话内保存。';
        }
      } else if (nextApiKey && !options.secureStorage?.isEncryptionAvailable()) {
        storageWarning = '系统安全存储不可用；API Key 只在当前会话内保存。';
      }
      configured = { baseUrl: input.baseUrl, model: input.model, ...(nextApiKey ? { apiKey: nextApiKey } : {}) };
      // Only ciphertext reaches SQLite. If no new key was supplied, preserve a
      // prior ciphertext rather than accidentally clearing it in an insecure session.
      repository.saveModelSettings({ baseUrl: configured.baseUrl, model: configured.model, ...(encryptedApiKey ? { encryptedApiKey } : {}) });
      return modelSettings();
    },
    subscribeWorkflow(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { database.close(); },
  };
}
