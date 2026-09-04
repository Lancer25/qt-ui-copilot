import { BrowserWindow, ipcMain, type BrowserWindow as BrowserWindowType } from 'electron';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { WorkspaceService } from '../workspace/workspace-service';
import { WorkspaceTreeService } from '../workspace/workspace-tree-service';
import { WorkspaceFileOperations } from '../workspace/workspace-file-operations';
import { WorkspaceWatcher, type WorkspaceChange } from '../workspace/workspace-watcher';
import { PreviewSessionService, resolvePreviewHostSource, type V3PreviewInput } from '../preview/preview-session-service';
import { UiPlanner, type ModelProvider } from '@qt-ui-copilot/agent-workflow';
import { loadProjectConfig, profileFromConfig, validateUiWithUic } from '@qt-ui-copilot/project-core';
import { applyOperations, parseUi } from '@qt-ui-copilot/ui-document';
import { RevisionService } from '../revisions/revision-service';
import { ContextService } from '../ai/context-service';
import { ConversationService } from '../ai/conversation-service';
import { UiCreationRequestSchema, V3StartTaskInputSchema, type UiCreationRequest, type V3StartTaskInput, type V3TaskEvent, type V3TaskPreview } from '@qt-ui-copilot/contracts';
import { AttachmentService } from '../ai/attachment-service';
import { UiCreationPlanner } from '../ai/ui-creation-planner';
import { UiCreationService } from '../ai/ui-creation-service';
import { QtWidgetCapabilitySource } from '@qt-ui-copilot/ui-document';
import { UiCreationTaskService } from '../ai/ui-creation-task-service';
import type { UiCreationProgress } from '../ai/ui-creation-task-service';
import { UiIntentPlanner } from '../ai/ui-intent-planner';
import { UiEnhancementPlanner } from '../ai/ui-enhancement-planner';
import { V3TaskEventService } from '../ai/v3-task-event-service';
import { QtBuildService } from '../build/qt-build-service';

const OpenWorkspaceSchema = z.object({ rootDir: z.string().min(1).max(4096), ignorePatterns: z.array(z.string().min(1).max(512)).max(128).optional() }).strict();
const WorkspaceIdSchema = z.object({ workspaceId: z.string().min(1).max(128) }).strict();
const ReadWorkspaceFileSchema = z.object({ workspaceId: z.string().min(1).max(128), filePath: z.string().min(1).max(4096) }).strict();
const WriteWorkspaceFileSchema = ReadWorkspaceFileSchema.extend({ content: z.string().max(2_000_000) }).strict();
const PreviewInputSchema = z.object({ uiFile: z.string().min(1), profile: z.object({ qtKitId: z.string().min(1), mode: z.enum(['quick', 'enhanced']), width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096), locale: z.string().min(2), style: z.string().min(1), qrcFiles: z.array(z.string()), stylesheets: z.array(z.string()), fonts: z.array(z.string()), pluginPaths: z.array(z.string()), highDpiMode: z.enum(['project-default', 'logical-96', 'system']) }), qt: z.object({ version: z.string(), compilerAbi: z.string(), architecture: z.string(), binDirectory: z.string(), uic: z.string(), rcc: z.string(), cmake: z.string(), cmakePrefixPath: z.string(), cmakeGenerator: z.string().optional() }), sourceDirectory: z.string(), cacheDirectory: z.string(), outputImage: z.string() }).strict();
const PreviewCancelSchema = z.object({ uiFile: z.string().min(1) }).strict();
const PlanInputSchema = z.object({ requirement: z.string().min(1).max(10000), uiFile: z.string().min(1), uiContent: z.string().max(2_000_000), contextMode: z.enum(['focused_ui', 'whole_project']), workspaceId: z.string().min(1).optional() }).strict();
const RevisionInputSchema = z.object({ uiFile: z.string().min(1), operations: z.array(z.unknown()), conversationId: z.string().min(1) }).strict();
const RevisionFileSchema = z.object({ uiFile: z.string().min(1) }).strict();
const UiCreationIpcSchema = UiCreationRequestSchema.extend({ taskId: z.string().min(1).max(128).optional() }).strict();
const CandidateIdSchema = z.object({ candidateId: z.string().min(1).max(128) }).strict();
const CancelUiCreationSchema = z.object({ taskId: z.string().min(1).max(128) }).strict();
const CapabilitySearchSchema = z.object({ workspaceId: z.string().min(1).max(128), text: z.string().max(2000).optional(), limit: z.number().int().min(1).max(20).optional(), kind: z.enum(['qt_widget', 'ui_fragment', 'promoted_widget']).optional(), tags: z.array(z.string().min(1).max(64)).max(16).optional(), kit: z.object({ id: z.string().optional(), version: z.string(), modules: z.array(z.string()) }).optional() }).strict();
const TreeRequestSchema = z.object({ workspaceId: z.string().min(1), showInternal: z.boolean().optional() }).strict();
const CreateEntrySchema = z.object({ workspaceId: z.string().min(1), parentPath: z.string().max(4096), name: z.string().min(1).max(255) }).strict();
const RenameEntrySchema = z.object({ workspaceId: z.string().min(1), sourcePath: z.string().min(1).max(4096), newName: z.string().min(1).max(255) }).strict();
const DeleteEntrySchema = z.object({ workspaceId: z.string().min(1), relativePath: z.string().min(1).max(4096) }).strict();
const PermanentDeleteSchema = DeleteEntrySchema.extend({ confirmation: z.string().min(1).max(255) }).strict();

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindowType, service = new WorkspaceService(), preview = new PreviewSessionService(), modelProvider?: ModelProvider): { dispose(): void } {
  const watchers = new Map<string, WorkspaceWatcher>();
  const revisionServices = new Map<string, RevisionService>();
  const creationTasks = new Map<string, AbortController>();
  const taskStreams = new Map<string, AbortController>();
  const taskEvents = new V3TaskEventService();
  const buildService = new QtBuildService();
  const qtCapabilitySource = new QtWidgetCapabilitySource();
  const treeService = new WorkspaceTreeService(service);
  const fileOperations = new WorkspaceFileOperations(service);
  const creationService = modelProvider ? (() => {
    const intentPlanner = new UiIntentPlanner(modelProvider);
    const enhancementPlanner = new UiEnhancementPlanner(modelProvider);
    const taskService = new UiCreationTaskService({
      planIntent: (input) => intentPlanner.plan(input),
      planEnhancements: (input) => enhancementPlanner.plan(input),
      // The candidate service performs the authoritative uic/preview validation
      // after staging the generated source. This keeps the task service pure
      // and lets it remain usable in deterministic tests.
      validateUic: async () => true,
    });
    return new UiCreationService({ workspace: service, planner: new UiCreationPlanner(modelProvider), taskService, attachments: new AttachmentService(), preview });
  })() : undefined;
  const publish = (change: WorkspaceChange): void => {
    if (!window.isDestroyed?.()) window.webContents.send('v3.workspace.onChange', change);
  };
  const publishTaskEvent = (event: V3TaskEvent): void => {
    if (!window.isDestroyed?.()) window.webContents.send('v3.ai.taskEvent', event);
  };
  const unsubscribeTaskEvents = taskEvents.subscribe(publishTaskEvent);
  const openHandler = async (_event: unknown, input: unknown) => {
    const parsed = OpenWorkspaceSchema.parse(input);
    const summary = await service.open(parsed.rootDir, parsed);
    watchers.get(summary.id)?.stop();
    const watcher = new WorkspaceWatcher(service, summary.id);
    watcher.on('change', publish);
    // Errors are deliberately kept off the change union; a malformed or
    // temporarily inaccessible file must not masquerade as a file event.
    watcher.on('error', (error) => console.error(`[workspace:${summary.id}] ${error.message}`));
    await watcher.start();
    watchers.set(summary.id, watcher);
    return summary;
  };
  const listFilesHandler = async (_event: unknown, input: unknown) => service.listFiles(WorkspaceIdSchema.parse(input).workspaceId);
  const findProjectRoot = (uiFile: string): string | undefined => {
    let current = resolve(dirname(uiFile));
    while (true) {
      if (existsSync(join(current, '.qt-ui-copilot', 'project.json'))) return current;
      const parent = parse(current).root === current ? current : dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  };
  const buildPlanContext = async (request: { requirement: string; uiFile: string; uiContent: string; contextMode: 'focused_ui' | 'whole_project'; workspaceId?: string }): Promise<Record<string, unknown>> => {
    let targetSemanticTree: Record<string, unknown> = { uiFile: request.uiFile, uiContent: request.uiContent };
    if (!request.workspaceId) return targetSemanticTree;
    const files = await service.listFiles(request.workspaceId);
    const contextService = new ContextService((filePath) => service.readText(request.workspaceId!, filePath));
    if (request.contextMode === 'whole_project') return { ...targetSemanticTree, projectSearch: await contextService.searchWholeProject(request.requirement, files as never[]) };
    const uiFile = files.find((file) => file.absolutePath === request.uiFile || file.relativePath === request.uiFile);
    if (uiFile) targetSemanticTree = { ...(await contextService.buildFocusedUiContext(uiFile as never, files as never[])) as unknown as Record<string, unknown> };
    return targetSemanticTree;
  };
  const appendCreationProgress = (taskId: string, progress: UiCreationProgress): void => {
    if (taskEvents.snapshot(taskId)?.status === 'cancelled') return;
    const previewStatuses: Record<NonNullable<UiCreationProgress['previewStatus']>, V3TaskPreview['status']> = { ready: 'completed', warning: 'warning', failed: 'failed' };
    const terminal = progress.stage === 'failed' ? 'failed' : progress.stage === 'cancelled' ? 'cancelled' : progress.stage === 'preview_ready' || progress.stage === 'base_candidate_ready' ? 'completed' : 'running';
    const type = terminal === 'failed' ? 'error' : terminal === 'cancelled' ? 'cancelled' : progress.warnings.length ? 'warning' : 'status';
    taskEvents.append(taskId, { lane: progress.stage.includes('preview') ? 'preview' : 'generation', type, status: terminal, stage: progress.stage, title: progress.message, ...(progress.warnings.length ? { detail: progress.warnings.map((warning) => warning.message).join('\n') } : {}) });
    if (progress.previewStatus) {
      const previewStatus = previewStatuses[progress.previewStatus];
      taskEvents.setPreview(taskId, { status: previewStatus, ...(progress.previewDataUrl ? { imageDataUrl: progress.previewDataUrl, mode: 'enhanced' } : {}), ...(progress.warnings[0] ? { error: progress.warnings[0].message } : {}) });
      taskEvents.updateCandidate(taskId, (candidate) => ({ ...candidate, ...(progress.previewDataUrl ? { previewDataUrl: progress.previewDataUrl } : {}), validation: { ...candidate.validation, preview: previewStatus === 'completed' } }));
    }
    if (progress.stage === 'preview_ready') {
      taskEvents.append(taskId, { lane: 'approval', type: 'done', status: 'completed', stage: 'waiting_approval', title: '等待用户审批保存' });
      taskStreams.delete(taskId);
    }
  };
  const runTaskStream = async (taskId: string, input: V3StartTaskInput, controller: AbortController): Promise<void> => {
    let previewContinuesInBackground = false;
    try {
      taskEvents.append(taskId, { lane: 'conversation', type: 'status', status: 'running', stage: 'started', title: input.kind === 'create' ? '正在创建新界面' : '正在分析当前界面' });
      if (input.kind === 'modify') {
        if (!modelProvider) throw new Error('模型服务尚未配置');
        const context = { requirement: input.request.requirement, targetSemanticTree: await buildPlanContext(input.request), runtimeFacts: { contextMode: input.request.contextMode } };
        for await (const event of new ConversationService(modelProvider).plan(taskId, context)) {
          if (controller.signal.aborted) throw new Error('task cancelled');
          if (event.type === 'message_delta') taskEvents.append(taskId, { lane: 'conversation', type: 'message_delta', status: 'running', title: 'AI 正在分析', detail: event.content });
          else if (event.type === 'plan') taskEvents.append(taskId, { lane: 'generation', type: 'artifact', status: 'completed', title: '修改方案已生成', artifact: { kind: 'diff', id: taskId } });
          else if (event.type === 'error') throw new Error(event.message);
        }
        taskEvents.append(taskId, { lane: 'conversation', type: 'done', status: 'completed', stage: 'waiting_approval', title: '等待用户审批' });
        return;
      }
      if (!creationService) throw new Error('模型服务尚未配置');
      const candidate = await creationService.createCandidate(input.request, (progress) => appendCreationProgress(taskId, progress), controller.signal, taskId);
      taskEvents.setCandidate(taskId, candidate);
      taskEvents.append(taskId, { lane: 'generation', type: 'artifact', status: 'completed', stage: 'base_candidate_ready', title: '基础 UI 已生成', artifact: { kind: 'candidate', id: candidate.id, filePath: candidate.targetPath, candidate } });
      if (input.request.createProject && candidate.files?.length) {
        const rootDir = resolve(service.getRoot(input.request.workspaceId));
        const relativeUi = relative(rootDir, candidate.targetPath).replaceAll('\\', '/');
        const stagedRoot = resolve(candidate.stagedPath ?? candidate.targetPath, ...relativeUi.split('/').map(() => '..'));
        const config = loadProjectConfig(rootDir);
        if (!config) throw new Error('当前项目缺少 Qt 构建配置，请先在设置中保存 Qt Kit。');
        const build = await buildService.build({ projectRoot: stagedRoot, stagedRoot, backend: input.request.buildBackend ?? config.build.backend ?? 'auto', qt: config.qt, buildDirectory: '.build', signal: controller.signal, onProgress: (progress) => taskEvents.append(taskId, { lane: 'generation', type: 'status', status: 'running', stage: `build_${progress.stage}`, title: progress.detail ?? progress.stage, detail: progress.command }) });
        taskEvents.updateCandidate(taskId, (current) => ({ ...current, executable: build.executable, buildDirectory: build.buildDirectory, buildBackend: build.backend }));
        await creationService.finishCandidatePreview(candidate.id, (progress) => appendCreationProgress(taskId, progress));
      }
      // UiCreationService continues the PreviewHost lane in the background;
      // its real progress callback completes this task when preview resolves.
      previewContinuesInBackground = true;
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && /cancelled/i.test(error.message));
      taskEvents.append(taskId, { lane: 'generation', type: cancelled ? 'cancelled' : 'error', status: cancelled ? 'cancelled' : 'failed', stage: cancelled ? 'cancelled' : 'failed', title: cancelled ? '任务已取消' : '任务执行失败', ...(error instanceof Error ? { detail: error.message } : {}) });
    } finally {
      if (!previewContinuesInBackground) taskStreams.delete(taskId);
    }
  };
  ipcMain.handle('v3.workspace.open', openHandler);
  ipcMain.handle('v3.workspace.listFiles', listFilesHandler);
  ipcMain.handle('v3.workspace.readText', (_event, input: unknown) => { const parsed = ReadWorkspaceFileSchema.parse(input); return service.readText(parsed.workspaceId, parsed.filePath); });
  ipcMain.handle('v3.workspace.writeText', (_event, input: unknown) => { const parsed = WriteWorkspaceFileSchema.parse(input); return service.writeText(parsed.workspaceId, parsed.filePath, parsed.content); });
  ipcMain.handle('v3.capabilities.search', (_event, input: unknown) => { const request = CapabilitySearchSchema.parse(input); const kit = request.kit ?? { version: '5.9.6', modules: ['Widgets'] }; const text = (request.text ?? '').toLowerCase(); return qtCapabilitySource.forKit(kit).filter((item) => (!request.kind || item.kind === request.kind) && (!text || `${item.displayName} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(text)) && (!request.tags?.length || request.tags.every((tag) => item.tags.includes(tag)))).slice(0, request.limit ?? 20).map((item) => ({ capabilityId: item.id, displayName: item.displayName, kind: item.kind, description: item.description, tags: item.tags, dependencyStatus: 'ready' as const, reasons: ['Qt Widgets 内置能力'] })); });
  ipcMain.handle('v3.workspace.tree', (_event, input: unknown) => { const request = TreeRequestSchema.parse(input); return treeService.build(request.workspaceId, request); });
  ipcMain.handle('v3.workspace.createFile', (_event, input: unknown) => { const request = CreateEntrySchema.parse(input); return fileOperations.createFile(request.workspaceId, request.parentPath, request.name); });
  ipcMain.handle('v3.workspace.createDirectory', (_event, input: unknown) => { const request = CreateEntrySchema.parse(input); return fileOperations.createDirectory(request.workspaceId, request.parentPath, request.name); });
  ipcMain.handle('v3.workspace.renameEntry', (_event, input: unknown) => { const request = RenameEntrySchema.parse(input); return fileOperations.renameEntry(request.workspaceId, request.sourcePath, request.newName); });
  ipcMain.handle('v3.workspace.trashEntry', (_event, input: unknown) => { const request = DeleteEntrySchema.parse(input); return fileOperations.trashEntry(request.workspaceId, request.relativePath); });
  ipcMain.handle('v3.workspace.deleteEntryPermanently', (_event, input: unknown) => { const request = PermanentDeleteSchema.parse(input); return fileOperations.deleteEntryPermanently(request.workspaceId, request.relativePath, request.confirmation); });
  ipcMain.handle('v3.preview.render', (_event, input: unknown) => { const request = PreviewInputSchema.parse(input); return preview.render({ ...request, sourceDirectory: resolvePreviewHostSource(request.sourceDirectory) } as V3PreviewInput); });
  ipcMain.handle('v3.preview.cancel', (_event, input: unknown) => { preview.cancel(PreviewCancelSchema.parse(input).uiFile); });
  ipcMain.handle('v3.preview.openWindow', (_event, input: unknown) => {
    const request = z.object({ imageDataUrl: z.string().startsWith('data:image/').max(14_000_000), title: z.string().max(256).optional() }).strict().parse(input);
    const previewWindow = new BrowserWindow({ width: 1280, height: 900, minWidth: 640, minHeight: 480, title: request.title ?? 'Qt UI 预览', autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const encoded = encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>${request.title ?? 'Qt UI 预览'}</title><style>html,body{margin:0;width:100%;height:100%;overflow:auto;background:#111319}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}img{display:block;max-width:none;box-shadow:0 12px 40px rgba(0,0,0,.45)}</style></head><body><img src="${request.imageDataUrl}" alt="${request.title ?? 'Qt UI 预览'}"></body></html>`);
    void previewWindow.loadURL(`data:text/html;charset=utf-8,${encoded}`);
    previewWindow.once('ready-to-show', () => previewWindow.maximize());
  });
  ipcMain.handle('v3.ai.plan', async (_event, input: unknown) => { if (!modelProvider) throw new Error('模型服务尚未配置'); const request = PlanInputSchema.parse(input); let context: Record<string, unknown> = { uiFile: request.uiFile, uiContent: request.uiContent }; if (request.contextMode === 'whole_project' && request.workspaceId) { const files = await service.listFiles(request.workspaceId); context = { ...context, projectSearch: await new ContextService((filePath) => service.readText(request.workspaceId!, filePath)).searchWholeProject(request.requirement, files as never[]) }; } return new UiPlanner(modelProvider).plan({ requirement: request.requirement, targetSemanticTree: context, runtimeFacts: { contextMode: request.contextMode } }); });
  ipcMain.handle('v3.ai.planStream', async (_event, input: unknown) => { if (!modelProvider) throw new Error('模型服务尚未配置'); const request = PlanInputSchema.parse(input); const events = []; const context = { requirement: request.requirement, targetSemanticTree: await buildPlanContext(request), runtimeFacts: { contextMode: request.contextMode } }; for await (const event of new ConversationService(modelProvider).plan(`v3-${request.uiFile}`, context)) events.push(event); return events; });
  ipcMain.handle('v3.ai.startTaskStream', (_event, input: unknown) => {
    const request = V3StartTaskInputSchema.parse(input);
    const taskId = request.taskId ?? `v3-task-${randomUUID()}`;
    if (taskStreams.has(taskId)) return { taskId };
    const controller = new AbortController();
    taskStreams.set(taskId, controller);
    void runTaskStream(taskId, request, controller);
    return { taskId };
  });
  ipcMain.handle('v3.ai.getTaskSnapshot', (_event, input: unknown) => taskEvents.snapshot(CancelUiCreationSchema.parse(input).taskId));
  ipcMain.handle('v3.ai.cancelTaskStream', (_event, input: unknown) => {
    const taskId = CancelUiCreationSchema.parse(input).taskId;
    const controller = taskStreams.get(taskId);
    if (!controller) return;
    controller.abort();
    taskStreams.delete(taskId);
    taskEvents.append(taskId, { lane: 'conversation', type: 'cancelled', status: 'cancelled', stage: 'cancelled', title: '任务已取消' });
  });
  ipcMain.handle('v3.ai.createUiCandidate', async (_event, input: unknown) => {
    if (!creationService) throw new Error('模型服务尚未配置');
    const parsed = UiCreationIpcSchema.parse(input);
    const taskId = parsed.taskId ?? `ui-create-${Date.now()}`;
    const controller = new AbortController(); creationTasks.set(taskId, controller);
    try {
      if (controller.signal.aborted) throw new Error('UI creation cancelled');
      const { taskId: _taskId, ...request } = parsed;
        return await creationService.createCandidate(request as UiCreationRequest, (progress: UiCreationProgress) => {
          if (!window.isDestroyed?.()) window.webContents.send('v3.ai.creationProgress', { taskId, progress });
        }, controller.signal, taskId);
    } finally { creationTasks.delete(taskId); }
  });
  ipcMain.handle('v3.ai.commitUiCandidate', async (_event, input: unknown) => { if (!creationService) throw new Error('UI creation service unavailable'); return creationService.commit(CandidateIdSchema.parse(input).candidateId); });
  ipcMain.handle('v3.ai.rejectUiCandidate', (_event, input: unknown) => { if (!creationService) throw new Error('UI creation service unavailable'); creationService.reject(CandidateIdSchema.parse(input).candidateId); });
  ipcMain.handle('v3.ai.cancelUiCreation', (_event, input: unknown) => { const taskId = CancelUiCreationSchema.parse(input).taskId; creationTasks.get(taskId)?.abort(); });
  ipcMain.handle('v3.revision.apply', async (_event, input: unknown) => {
    const request = RevisionInputSchema.parse(input);
    const revision = revisionServices.get(request.uiFile) ?? new RevisionService({
      apply: (source, operations, filePath) => applyOperations(parseUi(source, filePath), operations).source,
      validate: async (candidate, filePath) => {
        parseUi(candidate, filePath);
        const root = findProjectRoot(filePath); const config = root ? loadProjectConfig(root) : undefined;
        if (!root || !config) return { xml: true, semantic: true, uic: false, preview: false, findings: [{ severity: 'error' as const, code: 'project_profile_missing', message: '未找到项目 Preview Profile，无法执行 uic/预览验证。' }], validatedAt: Date.now() };
        const staging = await mkdtemp(join(root, '.qt-ui-copilot', 'v3-validation-')); const stagedUi = join(staging, 'candidate.ui');
        try {
          await writeFile(stagedUi, candidate, 'utf8');
          const profile = profileFromConfig(root, config); const uic = await validateUiWithUic(profile, stagedUi);
          if (!uic.valid) return { xml: true, semantic: true, uic: false, preview: false, findings: [{ severity: 'error' as const, code: 'uic_failed', message: (uic.stderr || uic.stdout || 'uic 校验失败').slice(0, 1000) }], validatedAt: Date.now() };
          const qt = config.qt; const p = config.preview;
          await preview.render({ uiFile: stagedUi, profile: { qtKitId: qt.version, mode: 'enhanced', width: p.width, height: p.height, locale: p.locale, style: p.style, qrcFiles: p.qrcFiles, stylesheets: p.stylesheets, fonts: p.fonts, pluginPaths: p.pluginPaths, highDpiMode: 'project-default' }, qt: { version: qt.version, compilerAbi: qt.compilerAbi, architecture: qt.architecture, binDirectory: qt.binDirectory, uic: qt.uic, rcc: qt.rcc, cmake: qt.cmake, cmakePrefixPath: qt.cmakePrefixPath, ...(qt.cmakeGenerator ? { cmakeGenerator: qt.cmakeGenerator } : {}) }, sourceDirectory: p.sourceDirectory, cacheDirectory: p.cacheDirectory, outputImage: join(staging, 'candidate.png') });
          return { xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: Date.now() };
        } finally { await rm(staging, { recursive: true, force: true }); }
      },
    });
    revisionServices.set(request.uiFile, revision); return revision.apply(request.uiFile, request.operations as never[], request.conversationId);
  });
  ipcMain.handle('v3.revision.undo', (_event, input: unknown) => { const file = RevisionFileSchema.parse(input).uiFile; return revisionServices.get(file)?.undo(file); });
  ipcMain.handle('v3.revision.redo', (_event, input: unknown) => { const file = RevisionFileSchema.parse(input).uiFile; return revisionServices.get(file)?.redo(file); });
  ipcMain.handle('v3.revision.rebase', (_event, input: unknown) => { const file = RevisionFileSchema.parse(input).uiFile; return revisionServices.get(file)?.rebaseAfterExternalChange(file); });
  return {
    dispose() {
      for (const watcher of watchers.values()) watcher.stop();
      watchers.clear();
      unsubscribeTaskEvents();
      for (const controller of taskStreams.values()) controller.abort();
      taskStreams.clear();
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
      ipcMain.removeHandler?.('v3.workspace.readText');
      ipcMain.removeHandler?.('v3.workspace.writeText');
      ipcMain.removeHandler?.('v3.capabilities.search');
      ipcMain.removeHandler?.('v3.workspace.tree'); ipcMain.removeHandler?.('v3.workspace.createFile'); ipcMain.removeHandler?.('v3.workspace.createDirectory'); ipcMain.removeHandler?.('v3.workspace.renameEntry'); ipcMain.removeHandler?.('v3.workspace.trashEntry'); ipcMain.removeHandler?.('v3.workspace.deleteEntryPermanently');
      ipcMain.removeHandler?.('v3.preview.render');
      ipcMain.removeHandler?.('v3.preview.cancel');
      ipcMain.removeHandler?.('v3.preview.openWindow');
      ipcMain.removeHandler?.('v3.ai.plan');
      ipcMain.removeHandler?.('v3.ai.planStream');
      ipcMain.removeHandler?.('v3.ai.startTaskStream');
      ipcMain.removeHandler?.('v3.ai.getTaskSnapshot');
      ipcMain.removeHandler?.('v3.ai.cancelTaskStream');
      for (const controller of creationTasks.values()) controller.abort();
      creationTasks.clear();
      ipcMain.removeHandler?.('v3.ai.createUiCandidate');
      ipcMain.removeHandler?.('v3.ai.commitUiCandidate');
      ipcMain.removeHandler?.('v3.ai.rejectUiCandidate');
      ipcMain.removeHandler?.('v3.ai.cancelUiCreation');
      ipcMain.removeHandler?.('v3.revision.apply');
      ipcMain.removeHandler?.('v3.revision.undo'); ipcMain.removeHandler?.('v3.revision.redo'); ipcMain.removeHandler?.('v3.revision.rebase');
    },
  };
}

export { OpenWorkspaceSchema, WorkspaceIdSchema };
