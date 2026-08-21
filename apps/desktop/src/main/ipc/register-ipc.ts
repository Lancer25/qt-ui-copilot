import { ipcMain, type BrowserWindow, dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { z } from 'zod';
import { ArtifactStore, loadProjectConfig, profileFromConfig, runProcess, RuntimeSession, scanProject, validateUiWithUic } from '@qt-ui-copilot/project-core';
import { openDatabase, TaskRepository } from '@qt-ui-copilot/task-store';
import { ComponentCatalog } from '@qt-ui-copilot/component-library';
import { TaskRepositoryWorkflowStore, UiPlanner, VisualCritic, WorkflowMachine, type ModelProvider, type ModelRequest, type WorkflowNode, type WorkflowState } from '@qt-ui-copilot/agent-workflow';
import type { ProjectConfig, ProjectProfile, UiPlan } from '@qt-ui-copilot/contracts';
import { applyOperations, CandidateFile, parseUi } from '@qt-ui-copilot/ui-document';
import { PreviewClient, PreviewHostBuilder } from '@qt-ui-copilot/preview-client';
import { ProbeClient, RouteRunner, type SemanticRoute } from '@qt-ui-copilot/probe-client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ImportProjectSchema = z.object({ rootDir: z.string().min(1).max(4096) }).strict();
const ChooseDirectorySchema = z.undefined();
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
  ipcMain.handle('projects:chooseDirectory', async (_event, input: unknown = undefined) => {
    ChooseDirectorySchema.parse(input);
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? undefined : result.filePaths[0];
  });
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
interface StoredProject { id: string; rootDir: string; uiFiles: string[]; profile?: ProjectProfile; config?: ProjectConfig; configRequired?: string; }
interface UiState { taskId: string; targetUi: string; status: WorkflowState['status']; node: WorkflowNode; plan?: unknown; events: Array<{ node: string; status: string; detail?: string }>; deterministicFindings: string[]; visualFindings: string[]; routeEvidence: string[]; qtKit?: string; xmlBefore?: string; xmlAfter?: string; beforeImage?: string; quickImage?: string; afterImage?: string; failure?: { code: string; message: string }; }

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
  const candidates = new Map<string, CandidateFile>();
  const runtimeSessions = new Map<string, { session: RuntimeSession; probe: ProbeClient }>();
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
  const persistArtifact = (taskId: string, store: ArtifactStore, kind: string, name: string, content: string | Uint8Array, metadata: unknown = {}): string => {
    const path = store.write(name, content);
    repository.addArtifact(taskId, { kind, relativePath: relative(store.root, path), metadata });
    return path;
  };
  const dataImage = async (imagePath: string): Promise<string> => `data:image/png;base64,${(await readFile(imagePath)).toString('base64')}`;
  const requiredContext = (taskId: string): { snapshot: UiState; project: StoredProject; profile: ProjectProfile; config: ProjectConfig; artifacts: ArtifactStore } | { error: string } => {
    const snapshot = snapshots.get(taskId); const task = repository.getTask(taskId); const project = task && projects.get(task.projectId);
    if (!snapshot || !project) return { error: 'Task context is unavailable' };
    if (!project.profile || !project.config) return { error: project.configRequired ?? '项目缺少 .qt-ui-copilot/project.json，无法执行真实验证。' };
    return { snapshot, project, profile: project.profile, config: project.config, artifacts: new ArtifactStore(resolve(project.rootDir, '.qt-ui-copilot', 'tasks', taskId)) };
  };
  const workflowFor = (taskId: string): WorkflowMachine => new WorkflowMachine({ store: workflowStore, execute: async (node, state) => {
    const context = requiredContext(taskId);
    if ('error' in context) return { kind: 'failed' as const, code: 'configuration_required', message: context.error };
    const { snapshot, project, profile, config, artifacts } = context;
    try {
      switch (node) {
        case 'IMPORT_PROJECT':
        case 'SELECT_UI':
        case 'RETRIEVE_COMPONENTS':
        case 'UNDERSTAND_REQUIREMENT':
          return { kind: 'passed' as const };
        case 'CAPTURE_BASELINE': {
          const source = await readFile(snapshot.targetUi, 'utf8');
          persistArtifact(taskId, artifacts, 'ui-source-before', 'before.ui', source);
          update({ ...snapshot, xmlBefore: source, qtKit: `${config.qt.version} / ${config.qt.compilerAbi}` });
          return { kind: 'passed' as const, evidence: ['baseline_capture'] };
        }
        case 'GENERATE_UI_PLAN': {
          const source = snapshot.xmlBefore ?? await readFile(snapshot.targetUi, 'utf8');
          const document = parseUi(source, snapshot.targetUi);
          const plan = await new UiPlanner(provider()).plan({
            requirement: snapshot.events.find((event) => event.node === 'UNDERSTAND_REQUIREMENT')?.detail ?? '',
            targetSemanticTree: { widgets: [...document.index.widgetsByName.keys()], layouts: [...document.index.layoutsByName.keys()] },
            runtimeFacts: { uiFile: snapshot.targetUi, qtVersion: config.qt.version },
            componentCandidates: await catalog.search({ text: snapshot.events[0]?.detail ?? '', limit: 3 }),
            previousFindings: snapshot.deterministicFindings,
          });
          persistArtifact(taskId, artifacts, 'ui-plan', 'plan.json', JSON.stringify(plan, null, 2));
          update({ ...snapshot, plan, node, status: state.status });
          return { kind: 'passed' as const };
        }
        case 'APPLY_CANDIDATE_PATCH': {
          const plan = snapshot.plan as UiPlan | undefined;
          if (!plan) return { kind: 'failed' as const, code: 'plan_missing', message: '没有可应用的结构化 UI 修改计划。' };
          const original = await readFile(snapshot.targetUi, 'utf8');
          const candidate = applyOperations(parseUi(original, snapshot.targetUi), plan.operations);
          const file = await CandidateFile.open(snapshot.targetUi, artifacts.resolve('candidate'));
          await file.stage(candidate.source); candidates.set(taskId, file);
          persistArtifact(taskId, artifacts, 'ui-source-candidate', 'candidate.ui', candidate.source, { operations: candidate.appliedOperations });
          update({ ...snapshot, xmlBefore: original, xmlAfter: candidate.source, node, status: state.status });
          return { kind: 'passed' as const };
        }
        case 'XML_VALIDATE': {
          const source = await readFile(snapshot.targetUi, 'utf8'); parseUi(source, snapshot.targetUi);
          return { kind: 'passed' as const };
        }
        case 'UIC_VALIDATE': {
          const validated = await validateUiWithUic(profile, snapshot.targetUi);
          persistArtifact(taskId, artifacts, 'uic-validation', 'uic.json', JSON.stringify(validated, null, 2));
          if (!validated.valid) return { kind: 'failed' as const, code: 'uic_validation_failed', message: validated.stderr || validated.stdout || 'uic rejected the candidate UI file' };
          return { kind: 'passed' as const };
        }
        case 'ENHANCED_PREVIEW': {
          const executable = await new PreviewHostBuilder().ensureBuilt({ qtVersion: config.qt.version, compilerAbi: config.qt.compilerAbi, architecture: config.qt.architecture, buildType: 'Debug', operatingSystem: process.platform, cmakeExecutable: config.qt.cmake, cmakePrefixPath: config.qt.cmakePrefixPath, cmakeGenerator: config.qt.cmakeGenerator, sourceDirectory: config.preview.sourceDirectory, cacheDirectory: config.preview.cacheDirectory });
          const outputImage = artifacts.resolve('preview-after.png');
          const result = await new PreviewClient({ executable, qtBinDirectory: config.qt.binDirectory }).render({ uiFile: snapshot.targetUi, width: config.preview.width, height: config.preview.height, locale: config.preview.locale, style: config.preview.style, qrcFiles: config.preview.qrcFiles, stylesheets: config.preview.stylesheets, fonts: config.preview.fonts, pluginPaths: config.preview.pluginPaths, rccExecutable: config.qt.rcc, cacheDirectory: config.preview.cacheDirectory, outputImage });
          persistArtifact(taskId, artifacts, 'enhanced-preview', 'preview-result.json', JSON.stringify(result, null, 2));
          const findings = result.findings.map((item) => `${item.severity}:${item.code}:${item.message}`);
          update({ ...snapshot, quickImage: await dataImage(outputImage), deterministicFindings: findings, node, status: state.status });
          return { kind: 'passed' as const, evidence: ['preview_capture'] };
        }
        case 'DETERMINISTIC_CHECKS': {
          if (snapshot.deterministicFindings.some((item) => item.startsWith('error:'))) return { kind: 'failed' as const, code: 'deterministic_validation_failed', message: snapshot.deterministicFindings.join('\n') };
          return { kind: 'passed' as const };
        }
        case 'VISUAL_REVIEW': {
          const plan = snapshot.plan as UiPlan | undefined;
          if (!snapshot.quickImage || !plan) return { kind: 'failed' as const, code: 'preview_or_plan_missing', message: '视觉检查需要预览截图和修改计划。' };
          const review = await new VisualCritic(provider()).review({ beforeImage: snapshot.beforeImage ?? snapshot.quickImage, afterImage: snapshot.quickImage, expectedResults: plan.expectedResults, deterministicFindings: [], });
          const visualFindings = [...review.blockingIssues, ...review.suggestions].map((finding) => `${finding.type}:${finding.description}`);
          update({ ...snapshot, visualFindings, node, status: state.status });
          if (!review.requirementSatisfied || review.blockingIssues.length) return { kind: 'repair' as const, reason: visualFindings.join('\n') || 'Visual review did not satisfy the requirement' };
          return { kind: 'passed' as const };
        }
        case 'INCREMENTAL_BUILD': {
          const result = await runProcess({ executable: profile.build.command.executable, args: profile.build.command.args, cwd: profile.rootDir, timeoutMs: 120_000 });
          persistArtifact(taskId, artifacts, 'incremental-build', 'build.json', JSON.stringify(result, null, 2));
          if (result.exitCode !== 0 || result.timedOut) return { kind: 'failed' as const, code: 'incremental_build_failed', message: result.stderr || result.stdout || 'Incremental build failed' };
          return { kind: 'passed' as const };
        }
        case 'LAUNCH_ISOLATED_EXE': {
          if (!config.run.routeId) return { kind: 'failed' as const, code: 'runtime_route_required', message: '真实运行验证需要配置 routeId 并保存 QtUiProbe 语义路线。' };
          let probe: ProbeClient | undefined;
          const session = new RuntimeSession(profile, taskId, {
            waitForProbe: async (current) => {
              const deadline = Date.now() + 10_000; let lastError: unknown;
              probe = new ProbeClient(current.serverName);
              while (Date.now() < deadline) {
                try { await probe.connect(500); return; } catch (error) { lastError = error; await new Promise((done) => setTimeout(done, 150)); }
              }
              throw lastError instanceof Error ? lastError : new Error('QtUiProbe did not become available');
            },
            gracefulStop: async () => { probe?.close(); },
          });
          await session.launch();
          if (!probe) return { kind: 'failed' as const, code: 'probe_unavailable', message: 'QtUiProbe connection was not created.' };
          runtimeSessions.set(taskId, { session, probe });
          return { kind: 'passed' as const };
        }
        case 'NAVIGATE_TO_TARGET': {
          const runtime = runtimeSessions.get(taskId); const routeId = config.run.routeId;
          if (!runtime || !routeId) return { kind: 'failed' as const, code: 'runtime_route_required', message: '真实运行验证需要已启动的 QtUiProbe 会话和保存的语义路线。' };
          const route = repository.getRoute(project.id, routeId) as SemanticRoute | undefined;
          if (!route || !Array.isArray(route.steps)) return { kind: 'failed' as const, code: 'runtime_route_required', message: `未找到路线“${routeId}”；请先录制目标页面导航。` };
          const result = await new RouteRunner(runtime.probe, runtime.session.token).run(route);
          persistArtifact(taskId, artifacts, 'route-result', 'route.json', JSON.stringify(result, null, 2));
          if (result.status !== 'arrived') return { kind: 'failed' as const, code: 'navigation_failed', message: result.error };
          update({ ...snapshot, routeEvidence: [`route:${routeId}`, `steps:${result.completedSteps}`] });
          return { kind: 'passed' as const };
        }
        case 'PROBE_VERIFY_PAGE': {
          const runtime = runtimeSessions.get(taskId);
          if (!runtime) return { kind: 'failed' as const, code: 'probe_unavailable', message: 'QtUiProbe runtime session is unavailable.' };
          const visible = await runtime.probe.request<{ windows?: unknown[] }>({ id: `${taskId}-visible`, token: runtime.session.token, method: 'identifyVisibleUi' });
          if (!visible.windows?.length) return { kind: 'failed' as const, code: 'target_page_not_visible', message: 'QtUiProbe did not find a visible target window.' };
          persistArtifact(taskId, artifacts, 'probe-visible-ui', 'visible-ui.json', JSON.stringify(visible, null, 2));
          return { kind: 'passed' as const };
        }
        case 'CAPTURE_REAL_RESULT': {
          const runtime = runtimeSessions.get(taskId);
          if (!runtime) return { kind: 'failed' as const, code: 'probe_unavailable', message: 'QtUiProbe runtime session is unavailable.' };
          const windows = await runtime.probe.request<{ windows?: Array<{ objectName?: string }> }>({ id: `${taskId}-windows`, token: runtime.session.token, method: 'listWindows' });
          const window = windows.windows?.find((entry) => entry.objectName)?.objectName;
          if (!window) return { kind: 'failed' as const, code: 'target_page_not_visible', message: 'QtUiProbe did not return a capturable window.' };
          const capture = await runtime.probe.request<{ pngBase64?: string }>({ id: `${taskId}-capture`, token: runtime.session.token, method: 'captureWindow', params: { window } });
          if (!capture.pngBase64) return { kind: 'failed' as const, code: 'runtime_capture_failed', message: 'QtUiProbe did not return PNG evidence.' };
          const png = Buffer.from(capture.pngBase64, 'base64'); persistArtifact(taskId, artifacts, 'real-runtime-capture', 'real-after.png', png);
          update({ ...snapshot, afterImage: `data:image/png;base64,${capture.pngBase64}` });
          return { kind: 'passed' as const, evidence: ['real_application_capture'] };
        }
        case 'FINAL_CHECKS': return { kind: 'passed' as const };
        case 'REPORT': {
          persistArtifact(taskId, artifacts, 'workflow-summary', 'summary.json', JSON.stringify({ taskId, evidence: state.evidence, deterministicFindings: snapshot.deterministicFindings, visualFindings: snapshot.visualFindings, routeEvidence: snapshot.routeEvidence }, null, 2));
          return { kind: 'passed' as const };
        }
        case 'ACCEPT_OR_ROLLBACK': {
          const candidate = candidates.get(taskId);
          if (!candidate) return { kind: 'failed' as const, code: 'candidate_missing', message: '没有可接受的候选文件。' };
          await candidate.accept({ approved: true }); candidates.delete(taskId);
          const runtime = runtimeSessions.get(taskId); if (runtime) { await runtime.session.stop(); runtime.probe.close(); runtimeSessions.delete(taskId); }
          return { kind: 'passed' as const };
        }
        default: return { kind: 'failed' as const, code: 'workflow_node_not_implemented', message: `工作流节点 ${String(node)} 未实现。` };
      }
    } catch (error) {
      return { kind: 'failed' as const, code: `${node.toLowerCase()}_failed`, message: error instanceof Error ? error.message : String(error) };
    }
  } });
  return {
    async importProject({ rootDir }) {
      let inventory;
      try {
        inventory = scanProject(rootDir);
      } catch {
        throw new Error(`无法导入项目目录“${rootDir}”：请确认目录存在且可访问。`);
      }
      const config = loadProjectConfig(inventory.rootDir);
      const item: StoredProject = config
        ? { id: randomUUID(), rootDir: inventory.rootDir, uiFiles: inventory.uiFiles, config, profile: profileFromConfig(inventory.rootDir, config) }
        : { id: randomUUID(), rootDir: inventory.rootDir, uiFiles: inventory.uiFiles, configRequired: '项目缺少 .qt-ui-copilot/project.json。导入成功，但开始真实任务前需要配置 Qt Kit、预览、构建和运行信息。' };
      projects.set(item.id, item);
      repository.upsertProject({ id: item.id, rootDir: item.rootDir, profilePath: config ? resolve(item.rootDir, '.qt-ui-copilot', 'project.json') : undefined, profile: config });
      return { id: item.id, rootDir: item.rootDir, uiFiles: item.uiFiles, ...(item.configRequired ? { configurationRequired: item.configRequired } : {}) };
    },
    async startTask({ projectId, targetUi, requirement }) {
      if (!options.modelProvider && !configured) return { kind: 'configuration_required', message: '请先在“模型设置”中配置 OpenAI-compatible Base URL、模型和可选 API Key。' };
      const project = projects.get(projectId);
      if (!project || !project.uiFiles.includes(targetUi)) throw new Error('Target .ui file does not belong to the imported project');
      if (!project.config || !project.profile) return { kind: 'configuration_required', message: project.configRequired ?? '项目缺少有效的 .qt-ui-copilot/project.json。' };
      const taskId = repository.createTask(projectId, targetUi);
      update({ taskId, targetUi, status: 'running', node: 'IMPORT_PROJECT', events: [{ node: 'UNDERSTAND_REQUIREMENT', status: 'completed', detail: requirement }], deterministicFindings: [], visualFindings: [], routeEvidence: [] });
      const state = await workflowFor(taskId).start({ taskId }); const snapshot = snapshots.get(taskId)!;
      return { kind: 'started', state: update({ ...snapshot, status: state.status, node: state.node, events: [...snapshot.events, { node: state.node, status: state.status }] }) };
    },
    async approveTask({ taskId, approved }) { const state = await workflowFor(taskId).approve(taskId, { approved }); return mutate(taskId, { status: state.status, node: state.node, failure: state.failure }); },
    async cancelTask({ taskId }) { const state = await workflowFor(taskId).cancel(taskId); return mutate(taskId, { status: state.status, node: state.node, failure: state.failure }); },
    async takeOverTask({ taskId }) { mutate(taskId, { events: [...(snapshots.get(taskId)?.events ?? []), { node: 'MANUAL_TAKEOVER', status: 'requested' }] }); },
    async acceptTask({ taskId }) { const state = await workflowFor(taskId).approve(taskId, { approved: true }); return mutate(taskId, { status: state.status, node: state.node }); },
    async rollbackTask({ taskId }) {
      const candidate = candidates.get(taskId);
      if (candidate) { await candidate.rollback(); candidates.delete(taskId); }
      const current = snapshots.get(taskId);
      const state = current?.status === 'failed'
        ? await workflowFor(taskId).cancel(taskId)
        : await workflowFor(taskId).approve(taskId, { approved: false });
      return mutate(taskId, { status: state.status, node: state.node, failure: state.failure });
    },
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
