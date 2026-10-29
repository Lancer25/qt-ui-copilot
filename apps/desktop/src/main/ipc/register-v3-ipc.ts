import { spawn } from 'node:child_process';
import { isConfigurationContinuation, isRetryableConfigurationFailure, routeTask } from '../ai/task-intent-router';
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
import { ComponentPreviewInputSchema, ComponentSourceIdSchema, ComponentSourceInputSchema, ComponentSourceSyncInputSchema, UiCreationRequestSchema, V3StartTaskInputSchema, type UiCreationRequest, type V3StartTaskInput, type V3TaskEvent, type V3TaskPreview } from '@qt-ui-copilot/contracts';
import { openDatabase, V3Repository } from '@qt-ui-copilot/task-store';
import { resolveLocalQtToolchain, type LocalQtBindingStore } from '../settings/project-qt-binding';
import { AttachmentService } from '../ai/attachment-service';
import { UiCreationPlanner } from '../ai/ui-creation-planner';
import { UiCreationService } from '../ai/ui-creation-service';
import { QtWidgetCapabilitySource } from '@qt-ui-copilot/ui-document';
import { UiCreationTaskService } from '../ai/ui-creation-task-service';
import type { UiCreationProgress } from '../ai/ui-creation-task-service';
import { UiIntentPlanner } from '../ai/ui-intent-planner';
import { UiEnhancementPlanner } from '../ai/ui-enhancement-planner';
import { V3TaskEventService } from '../ai/v3-task-event-service';
import { UiAdjustmentService } from '../ai/ui-adjustment-service';
import { QtBuildService } from '../build/qt-build-service';
import { ComponentCatalog } from '@qt-ui-copilot/component-library';
import { materializeComponents } from '../ai/component-materializer';
import { ComponentSourceService, type ComponentSourceSecureStorage } from '../components/component-source-service';
import { ComponentPreviewService } from '../components/component-preview-service';

const OpenWorkspaceSchema = z.object({ rootDir: z.string().min(1).max(4096), ignorePatterns: z.array(z.string().min(1).max(512)).max(128).optional() }).strict();
const WorkspaceIdSchema = z.object({ workspaceId: z.string().min(1).max(128) }).strict();
const ReadWorkspaceFileSchema = z.object({ workspaceId: z.string().min(1).max(128), filePath: z.string().min(1).max(4096) }).strict();
const WriteWorkspaceFileSchema = ReadWorkspaceFileSchema.extend({ content: z.string().max(2_000_000) }).strict();
const PortableProjectProfileSchema = z.object({
  id: z.string().min(1).max(255),
  qt: z.object({ version: z.string().min(1).max(128), qtMajor: z.union([z.literal(5), z.literal(6)]).optional(), compilerAbi: z.string().min(1).max(128), architecture: z.string().min(1).max(64) }).strict(),
  build: z.object({ backend: z.enum(['auto', 'qmake', 'msbuild']), directory: z.string().min(1).max(4096).optional() }).strict(),
  run: z.object({ executable: z.string().min(1).max(4096).optional() }).strict().optional(),
  preview: z.object({ width: z.number().int().min(160).max(4096).optional(), height: z.number().int().min(120).max(4096).optional(), locale: z.string().min(2).max(32).optional(), style: z.string().min(1).max(128).optional(), mode: z.enum(['quick', 'enhanced']).optional(), highDpiMode: z.enum(['project-default', 'logical-96', 'system']).optional() }).strict().optional(),
}).strict();
const SyncProjectProfileSchema = z.object({ workspaceId: z.string().min(1).max(128), profile: PortableProjectProfileSchema }).strict();
const PreviewInputSchema = z.object({ uiFile: z.string().min(1), profile: z.object({ qtKitId: z.string().min(1), mode: z.enum(['quick', 'enhanced']), width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096), locale: z.string().min(2), style: z.string().min(1), qrcFiles: z.array(z.string()), stylesheets: z.array(z.string()), fonts: z.array(z.string()), pluginPaths: z.array(z.string()), highDpiMode: z.enum(['project-default', 'logical-96', 'system']) }), qt: z.object({ version: z.string(), compilerAbi: z.string(), architecture: z.string(), binDirectory: z.string(), uic: z.string(), rcc: z.string(), cmake: z.string(), cmakePrefixPath: z.string(), cmakeGenerator: z.string().optional() }), sourceDirectory: z.string(), cacheDirectory: z.string(), outputImage: z.string() }).strict();
const PreviewCancelSchema = z.object({ uiFile: z.string().min(1) }).strict();
const PlanInputSchema = z.object({ requirement: z.string().min(1).max(10000), uiFile: z.string().min(1), uiContent: z.string().max(2_000_000), contextMode: z.enum(['focused_ui', 'whole_project']), workspaceId: z.string().min(1).optional() }).strict();
const RevisionInputSchema = z.object({ uiFile: z.string().min(1), operations: z.array(z.unknown()), conversationId: z.string().min(1) }).strict();
const RevisionFileSchema = z.object({ uiFile: z.string().min(1) }).strict();
const UiCreationIpcSchema = UiCreationRequestSchema.extend({ taskId: z.string().min(1).max(128).optional() }).strict();
const CandidateIdSchema = z.object({ candidateId: z.string().min(1).max(128) }).strict();
const CancelUiCreationSchema = z.object({ taskId: z.string().min(1).max(128) }).strict();
const V3TaskListSchema = z.object({ workspaceId: z.string().min(1).max(128).optional() }).strict().optional();
const CapabilitySearchSchema = z.object({ workspaceId: z.string().min(1).max(128), text: z.string().max(2000).optional(), limit: z.number().int().min(1).max(20).optional(), kind: z.enum(['qt_widget', 'ui_fragment', 'promoted_widget']).optional(), tags: z.array(z.string().min(1).max(64)).max(16).optional(), kit: z.object({ id: z.string().optional(), version: z.string(), modules: z.array(z.string()), qtMajor: z.number().int().min(4).max(9).optional(), compilerAbi: z.string().min(1).max(128).optional(), architecture: z.string().min(1).max(64).optional() }).optional() }).strict();
const TreeRequestSchema = z.object({ workspaceId: z.string().min(1), showInternal: z.boolean().optional() }).strict();
const CreateEntrySchema = z.object({ workspaceId: z.string().min(1), parentPath: z.string().max(4096), name: z.string().min(1).max(255) }).strict();
const RenameEntrySchema = z.object({ workspaceId: z.string().min(1), sourcePath: z.string().min(1).max(4096), newName: z.string().min(1).max(255) }).strict();
const DeleteEntrySchema = z.object({ workspaceId: z.string().min(1), relativePath: z.string().min(1).max(4096) }).strict();
const PermanentDeleteSchema = DeleteEntrySchema.extend({ confirmation: z.string().min(1).max(255) }).strict();

/**
 * Candidate build paths are workspace-relative by contract, because the project
 * file has to describe the same build on another computer. A build that ran
 * outside the workspace — in a staged or temporary root — has no such form, and
 * spelling one with `..` fails the snapshot schema, so `undefined` asks the
 * caller to keep the portable path it already had.
 */
export const workspaceRelativeBuildPath = (rootDir: string, value: string): string | undefined => {
  const relativePath = relative(rootDir, value).replaceAll('\\', '/');
  return relativePath && relativePath !== '..' && !relativePath.startsWith('../') && !/^[A-Za-z]:\//.test(relativePath) ? relativePath : undefined;
};

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindowType, service = new WorkspaceService(), preview = new PreviewSessionService(), modelProvider?: ModelProvider, repository?: V3Repository, secureStorage?: ComponentSourceSecureStorage, settingsRepository?: LocalQtBindingStore): { dispose(): void } {
  const watchers = new Map<string, WorkspaceWatcher>();
  const revisionServices = new Map<string, RevisionService>();
  const creationTasks = new Map<string, AbortController>();
  const taskStreams = new Map<string, AbortController>();
  const retryableTasks = new Map<string, V3StartTaskInput>();
  const taskEvents = new V3TaskEventService(repository);
  const buildService = new QtBuildService();
  const adjustmentService = modelProvider ? new UiAdjustmentService(new UiEnhancementPlanner(modelProvider)) : undefined;
  const qtCapabilitySource = new QtWidgetCapabilitySource();
  const componentLibraryRoot = resolveBundledComponentLibraryRoot();
  const gtronickComponentLibraryRoot = resolveExternalComponentLibraryRoot('gtronick-qss');
  const componentCatalog = new ComponentCatalog();
  let componentCatalogReady: Promise<number> | undefined;
  const ensureComponentCatalog = (): Promise<number> => componentCatalogReady ??= existsSync(componentLibraryRoot) ? componentCatalog.indexLibrary(componentLibraryRoot) : Promise.resolve(0);
  const componentSourceDatabase = repository ? undefined : openDatabase(':memory:');
  const componentSourceRepository = repository ?? new V3Repository(componentSourceDatabase!);
  const componentSources = new ComponentSourceService({
    repository: componentSourceRepository,
    bundledRoot: componentLibraryRoot,
    protectedSources: [
      { id: 'bundled', name: '内置组件库', rootDir: componentLibraryRoot, licenseName: 'Qt UI Copilot Bundled Components' },
      { id: 'gtronick-qss', name: 'GTRONICK/QSS 基础控件', rootDir: gtronickComponentLibraryRoot },
    ],
    ...(secureStorage ? { secureStorage } : {}),
    resolveQtKit: (id) => {
      const record = settingsRepository?.listQtKits().find((item) => item.id === id);
      if (!record) return undefined;
      const config = record.config as { version?: string; qtMajor?: number; compilerAbi?: string; architecture?: string };
      return { id: record.id, version: config.version ?? '', qtMajor: config.qtMajor, compilerAbi: config.compilerAbi, architecture: config.architecture };
    },
  });
  const componentPreviews = new ComponentPreviewService({
    sources: componentSources,
    workspace: service,
    preview,
    sourceDirectory: componentLibraryRoot,
    defaultQtKit: () => {
      const records = settingsRepository?.listQtKits() ?? [];
      const record = records.find((candidate) => (candidate.config as { isDefault?: unknown }).isDefault === true) ?? records[0];
      return record?.config as unknown as import('../components/component-preview-service').DefaultQtKit | undefined;
    },
  });
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
      applyCapabilities: (input) => materializeComponents({ ...input, catalog: { get: (id) => componentCatalog.get(id), getByCapabilityId: (capabilityId) => componentSources.getRecordByCapabilityId(capabilityId), getStylesheetsByCapabilityId: (capabilityId) => componentSources.getStylesheetsByCapabilityId(capabilityId) } }),
    });
    return new UiCreationService({ workspace: service, planner: new UiCreationPlanner(modelProvider), taskService, attachments: new AttachmentService(), preview, localQt: (rootDir) => resolveLocalQtToolchain(rootDir, settingsRepository)?.qt });
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
  const buildPlanContext = async (request: { requirement: string; uiFile: string; uiContent: string; contextMode: 'focused_ui' | 'whole_project'; workspaceId?: string; attachments?: UiCreationRequest['attachments'] }): Promise<Record<string, unknown>> => {
    const attachments = (request.attachments ?? []).map((attachment) => ({ name: attachment.name, kind: attachment.kind, mimeType: attachment.mimeType, ...(attachment.text !== undefined ? { text: attachment.text } : {}) }));
    let targetSemanticTree: Record<string, unknown> = { uiFile: request.uiFile, uiContent: request.uiContent, attachments };
    if (!request.workspaceId) return targetSemanticTree;
    const files = await service.listFiles(request.workspaceId);
    const contextService = new ContextService((filePath) => service.readText(request.workspaceId!, filePath));
    if (request.contextMode === 'whole_project') return { ...targetSemanticTree, projectSearch: await contextService.searchWholeProject(request.requirement, files as never[]) };
    const uiFile = files.find((file) => file.absolutePath === request.uiFile || file.relativePath === request.uiFile);
    if (uiFile) targetSemanticTree = { ...(await contextService.buildFocusedUiContext(uiFile as never, files as never[])) as unknown as Record<string, unknown> };
    return targetSemanticTree;
  };
  /**
   * Resolves the Qt tool paths for the project on this computer. A portable
   * project profile deliberately records only the Qt identity, so without the
   * locally bound Qt Kit the task paths below can never build anything.
   */
  const localQtFor = (taskId: string, rootDir: string): ReturnType<typeof resolveLocalQtToolchain> => {
    const resolved = resolveLocalQtToolchain(rootDir, settingsRepository);
    const declared = resolved?.fingerprint;
    if (resolved && declared && (declared.version !== resolved.qt.version || declared.compilerAbi !== resolved.qt.compilerAbi)) {
      taskEvents.append(taskId, { lane: 'generation', type: 'warning', status: 'running', stage: 'qt_kit_mismatch', title: `已回退到本机 Qt ${resolved.qt.version}（${resolved.qt.compilerAbi}）`, detail: `项目声明 Qt ${declared.version}（${declared.compilerAbi}）。请在设置的项目绑定中选择匹配的 Qt Kit。` });
    }
    return resolved;
  };
  const appendCreationProgress = (taskId: string, progress: UiCreationProgress): void => {    if (taskEvents.snapshot(taskId)?.status === 'cancelled') return;
    const previewStatuses: Record<NonNullable<UiCreationProgress['previewStatus']>, V3TaskPreview['status']> = { ready: 'completed', warning: 'warning', failed: 'failed' };
    const terminal = progress.stage === 'failed' ? 'failed' : progress.stage === 'cancelled' ? 'cancelled' : progress.stage === 'preview_ready' || progress.stage === 'base_candidate_ready' ? 'completed' : 'running';
    const type = terminal === 'failed' ? 'error' : terminal === 'cancelled' ? 'cancelled' : progress.warnings.length ? 'warning' : 'status';
    taskEvents.append(taskId, { lane: progress.stage.includes('preview') ? 'preview' : 'generation', type, status: terminal, stage: progress.stage, title: progress.message, ...(progress.warnings.length ? { detail: progress.warnings.map((warning) => warning.message).join('\n') } : {}) });
    if (progress.previewStatus) {
      const previewStatus = previewStatuses[progress.previewStatus];
      taskEvents.setPreview(taskId, { status: previewStatus, ...(progress.previewDataUrl ? { imageDataUrl: progress.previewDataUrl, mode: 'enhanced' } : {}), ...(progress.warnings[0] ? { error: progress.warnings[0].message } : {}) });
      taskEvents.updateCandidate(taskId, (candidate) => ({ ...candidate, ...(progress.previewDataUrl ? { previewDataUrl: progress.previewDataUrl } : {}), validation: { ...candidate.validation, preview: previewStatus === 'completed' } }));
      const candidate = taskEvents.snapshot(taskId)?.candidate;
      if (candidate) taskEvents.append(taskId, { lane: 'preview', type: 'artifact', status: 'completed', stage: progress.stage, title: progress.message, artifact: { kind: 'candidate', id: candidate.id, filePath: candidate.targetPath, candidate } });
    }
    if (progress.stage === 'preview_ready') {
      taskEvents.append(taskId, { lane: 'approval', type: 'done', status: 'completed', stage: 'waiting_approval', title: '等待用户审批保存' });
      taskStreams.delete(taskId);
    }
  };
  const runTaskStream = async (taskId: string, requestedInput: V3StartTaskInput, controller: AbortController, resumeFromSettings = false): Promise<void> => {
    let previewContinuesInBackground = false;
    const pendingInput = retryableTasks.get(taskId);
    const resuming = Boolean(pendingInput && (resumeFromSettings || isConfigurationContinuation(requestedInput.request.requirement)));
    const input = resuming ? pendingInput! : requestedInput;
    if (resuming) retryableTasks.delete(taskId);
    try {
      await Promise.all([ensureComponentCatalog(), componentSources.ensureBundledSource()]);
      if (!resumeFromSettings) taskEvents.append(taskId, { lane: 'conversation', type: 'status', status: 'completed', stage: 'user_message', title: '你', detail: requestedInput.request.requirement });
      if (resuming) taskEvents.append(taskId, { lane: 'conversation', type: 'status', status: 'running', stage: 'resuming', title: '配置已更新，正在继续上次任务' });
      if (!modelProvider) throw new Error('模型服务尚未配置');
      const workspaceId = 'workspaceId' in input.request ? input.request.workspaceId : taskEvents.snapshot(taskId)?.candidate?.workspaceId;
      const root = workspaceId ? service.getRoot(workspaceId) : undefined;
      const files = workspaceId ? await service.listFiles(workspaceId) : [];
      taskEvents.append(taskId, { lane: 'conversation', type: 'status', status: 'running', stage: 'routing', title: '正在理解请求' });
      const decision = await routeTask(modelProvider, input.request.requirement, {
        files: files.map(file => file.relativePath).slice(0, 200),
        currentUi: 'uiContent' in input.request ? input.request.uiContent : undefined,
        history: taskEvents.snapshot(taskId)?.events.filter(event => event.stage === 'user_message' || event.type === 'message_delta').slice(-20).map(event => ({ role: event.stage === 'user_message' ? 'user' : 'assistant', content: event.detail })),
      }, 'attachments' in input.request ? input.request.attachments : []);
      if (controller.signal.aborted) throw new Error('task cancelled');
      if (decision.action === 'reply') {
        taskEvents.append(taskId, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: decision.reply || '请进一步描述你的问题。' });
        taskEvents.append(taskId, { lane: 'conversation', type: 'done', status: 'completed', title: '回复完成' });
        return;
      }
      if (decision.action !== 'ui') {
        if (!root) throw new Error('请先打开需要编译运行的项目文件夹');
        const config = loadProjectConfig(root, localQtFor(taskId, root)?.qt);
        if (!config) throw new Error('项目构建配置不完整，请在设置中保存 Qt Kit 和构建配置');
        let executable = config.run.executable;
        if (decision.action !== 'run') {
          const built = await buildService.build({ projectRoot: root, stagedRoot: root, backend: config.build.backend ?? 'auto', qt: config.qt, buildDirectory: '.qt-ui-copilot/build', signal: controller.signal, onProgress: progress => { const titles = { detecting: '正在识别构建方式', configuring: '正在生成构建配置', compiling: '正在编译应用', completed: '应用构建完成' } as const; taskEvents.append(taskId, { lane: 'generation', type: 'status', status: progress.stage === 'completed' ? 'completed' : 'running', stage: 'build_' + progress.stage, title: titles[progress.stage], detail: progress.command }); } });
          executable = built.executable;
        }
        if (controller.signal.aborted) throw new Error('task cancelled');
        if (decision.action !== 'build') {
          executable = resolve(root, executable.replaceAll('${projectRoot}', root));
          if (!existsSync(executable)) throw new Error('应用尚未编译，找不到可执行文件：' + executable);
          taskEvents.append(taskId, { lane: 'generation', type: 'status', status: 'running', stage: 'launching', title: '正在启动应用', detail: executable });
          await new Promise<void>((accept, reject) => {
            const child = spawn(executable, config.run.args, { cwd: root, shell: false, windowsHide: false, stdio: 'ignore', env: { ...process.env, ...config.run.environment, PATH: config.qt.binDirectory + ';' + (process.env.PATH ?? '') } });
            child.once('error', reject);
            child.once('spawn', () => { setTimeout(() => { if (child.exitCode !== null) reject(new Error(`应用启动后立即退出，退出码 ${child.exitCode}`)); else { child.unref(); accept(); } }, 800); });
          });
        }
        taskEvents.append(taskId, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: decision.action === 'build' ? '应用编译成功。' : '应用窗口已启动。' });
        taskEvents.append(taskId, { lane: 'conversation', type: 'done', status: 'completed', title: '本轮完成' });
        return;
      }
      if (input.kind === 'adjust') {
        if (!modelProvider || !adjustmentService || !creationService) throw new Error('模型服务尚未配置');
        const snapshot = taskEvents.snapshot(taskId);
        const current = snapshot?.candidate;
        if (!current || current.id !== input.request.candidateId) throw new Error('当前任务没有可调整的候选界面');
        const uiFile = current.stagedPath ?? current.targetPath;
        taskEvents.append(taskId, { lane: 'conversation', type: 'status', status: 'running', stage: 'analyzing', title: 'AI 正在分析预览调整' });
        const result = await adjustmentService.adjust({ uiFile, uiContent: current.source, requirement: input.request.requirement, previewDataUrl: input.request.previewDataUrl, contextMode: input.request.contextMode, signal: controller.signal });
        taskEvents.append(taskId, { lane: 'generation', type: 'status', status: 'running', stage: 'applying', title: '正在应用界面调整', detail: result.summary });
        const updated = await creationService.replaceCandidateSource(current.id, result.source);
        taskEvents.updateCandidate(taskId, () => updated);
        taskEvents.append(taskId, { lane: 'generation', type: 'artifact', status: 'completed', stage: 'adjustment_applied', title: '候选界面已更新', artifact: { kind: 'candidate', id: updated.id, filePath: updated.targetPath, candidate: updated } });
        taskEvents.append(taskId, { lane: 'generation', type: 'status', status: 'completed', stage: 'validated', title: '界面调整已通过校验', detail: `${result.beforeHash.slice(0, 8)} → ${result.afterHash.slice(0, 8)}` });
        await creationService.finishCandidatePreview(current.id, (progress) => appendCreationProgress(taskId, progress));
        return;
      }
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
        const config = loadProjectConfig(rootDir, localQtFor(taskId, rootDir)?.qt);
        if (!config) throw new Error('当前项目缺少 Qt 构建配置，请先在设置中保存 Qt Kit。');
        const build = await buildService.build({ projectRoot: stagedRoot, stagedRoot, backend: input.request.buildBackend ?? config.build.backend ?? 'auto', qt: config.qt, buildDirectory: '.build', signal: controller.signal, onProgress: (progress) => taskEvents.append(taskId, { lane: 'generation', type: 'status', status: 'running', stage: `build_${progress.stage}`, title: progress.detail ?? progress.stage, detail: progress.command }) });
        // The build ran in a staged root, which usually sits outside the
        // workspace; candidate paths must stay relative, so a path that cannot
        // be expressed that way keeps the portable value the candidate already
        // carries for its committed location.
        const builtExecutable = workspaceRelativeBuildPath(rootDir, build.executable);
        const builtDirectory = workspaceRelativeBuildPath(rootDir, build.buildDirectory);
        taskEvents.updateCandidate(taskId, (current) => ({ ...current, ...(builtExecutable ? { executable: builtExecutable } : {}), ...(builtDirectory ? { buildDirectory: builtDirectory } : {}), buildBackend: build.backend }));
        await creationService.finishCandidatePreview(candidate.id, (progress) => appendCreationProgress(taskId, progress));
      }
      // UiCreationService continues the PreviewHost lane in the background;
      // its real progress callback completes this task when preview resolves.
      previewContinuesInBackground = true;
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && /cancelled/i.test(error.message));
      if (!cancelled && error instanceof Error && isRetryableConfigurationFailure(error.message)) retryableTasks.set(taskId, input);
      taskEvents.append(taskId, { lane: 'generation', type: cancelled ? 'cancelled' : 'error', status: cancelled ? 'cancelled' : 'failed', stage: cancelled ? 'cancelled' : 'failed', title: cancelled ? '任务已取消' : '任务执行失败', ...(error instanceof Error ? { detail: error.message } : {}) });
    } finally {
      if (!previewContinuesInBackground) taskStreams.delete(taskId);
    }
  };
  ipcMain.handle('v3.workspace.open', openHandler);
  ipcMain.handle('v3.workspace.listFiles', listFilesHandler);
  ipcMain.handle('v3.workspace.readText', (_event, input: unknown) => { const parsed = ReadWorkspaceFileSchema.parse(input); return service.readText(parsed.workspaceId, parsed.filePath); });
  ipcMain.handle('v3.workspace.writeText', (_event, input: unknown) => { const parsed = WriteWorkspaceFileSchema.parse(input); return service.writeText(parsed.workspaceId, parsed.filePath, parsed.content); });
  ipcMain.handle('v3.workspace.syncProjectProfile', (_event, input: unknown) => { const parsed = SyncProjectProfileSchema.parse(input); return service.syncProjectProfile(parsed.workspaceId, parsed.profile); });
  const sourceSearchKit = (kit: z.infer<typeof CapabilitySearchSchema>['kit']) => {
    if (!kit) return { version: '5.9.6', modules: ['Widgets'], qtMajor: 5, compilerAbi: undefined, architecture: undefined };
    const saved = kit.id ? settingsRepository?.listQtKits().find((record) => record.id === kit.id) : undefined;
    const config = saved?.config as { version?: string; qtMajor?: number; compilerAbi?: string; architecture?: string } | undefined;
    return { ...kit, version: kit.version || config?.version || '5.9.6', qtMajor: kit.qtMajor ?? config?.qtMajor, compilerAbi: kit.compilerAbi ?? config?.compilerAbi, architecture: kit.architecture ?? config?.architecture };
  };
  ipcMain.handle('v3.capabilities.search', async (_event, input: unknown) => {
    const request = CapabilitySearchSchema.parse(input);
    const kit = sourceSearchKit(request.kit);
    const text = request.text ?? '';
    const local = request.kind && request.kind !== 'ui_fragment' ? [] : await componentSources.search({ text, qtVersion: kit.version, kit, limit: request.limit ?? 20 });
    const normalizedText = text.toLowerCase();
    const builtin = qtCapabilitySource.forKit(kit).filter((item) => (!request.kind || item.kind === request.kind) && (!normalizedText || `${item.displayName} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(normalizedText)) && (!request.tags?.length || request.tags.every((tag) => item.tags.includes(tag)))).map((item) => ({ capabilityId: item.id, displayName: item.displayName, kind: item.kind, description: item.description, tags: item.tags, dependencyStatus: 'ready' as const, reasons: ['Qt Widgets 内置能力'] }));
    return [...local, ...builtin].slice(0, request.limit ?? 20);
  });
  ipcMain.handle('v3.componentSources.list', () => componentSources.listSources());
  ipcMain.handle('v3.componentSources.save', (_event, input: unknown) => componentSources.saveSource(ComponentSourceInputSchema.parse(input)));
  ipcMain.handle('v3.componentSources.remove', (_event, input: unknown) => componentSources.removeSource(ComponentSourceIdSchema.parse(input).sourceId));
  ipcMain.handle('v3.componentSources.test', (_event, input: unknown) => componentSources.testSource(ComponentSourceIdSchema.parse(input).sourceId));
  ipcMain.handle('v3.componentSources.sync', (_event, input: unknown) => { const request = ComponentSourceSyncInputSchema.parse(input); return componentSources.syncSource(request.sourceId, request.query); });
  ipcMain.handle('v3.componentSources.search', (_event, input: unknown) => { const request = CapabilitySearchSchema.extend({ sourceId: z.string().min(1).max(128).optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(2_047).optional() }).parse(input); const kit = sourceSearchKit(request.kit); return componentSources.search({ text: request.text, sourceId: request.sourceId, qtVersion: kit.version, kit, limit: request.limit ?? 20, offset: request.offset }); });
  ipcMain.handle('v3.componentSources.preview', (_event, input: unknown) => componentPreviews.render(ComponentPreviewInputSchema.parse(input)));
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
    const workspaceId = 'workspaceId' in request.request ? request.request.workspaceId : undefined;
    const targetPath = request.kind === 'create' ? join(request.request.directory, request.request.fileName) : request.request.uiFile;
    taskEvents.beginTask(taskId, {
      ...(workspaceId ? { workspaceId } : {}),
      // A reference image without text is a supported request, so the history
      // title falls back to the attachment name instead of the empty string
      // the snapshot schema rejects.
      title: (request.request.requirement.trim() || (('attachments' in request.request ? request.request.attachments : []).find((attachment) => attachment.kind === 'image')?.name ?? 'AI 任务')).slice(0, 256),
      ...(targetPath ? { targetPath } : {}),
    });
    const controller = new AbortController();
    taskStreams.set(taskId, controller);
    // The stream reports its own failures through task events; this only keeps a
    // defect in that reporting from surfacing as an unhandled rejection.
    void runTaskStream(taskId, request, controller).catch((error) => console.error(`[task:${taskId}] 任务流异常终止：`, error));
    return { taskId };
  });
  ipcMain.handle('v3.ai.resumeTaskStream', (_event, input: unknown) => {
    const taskId = CancelUiCreationSchema.parse(input).taskId;
    const pending = retryableTasks.get(taskId);
    if (!pending) return { resumed: false };
    if (taskStreams.has(taskId)) return { resumed: true };
    const controller = new AbortController();
    taskStreams.set(taskId, controller);
    void runTaskStream(taskId, pending, controller, true).catch((error) => console.error(`[task:${taskId}] 任务流异常终止：`, error));
    return { resumed: true };
  });
  ipcMain.handle('v3.ai.getTaskSnapshot', (_event, input: unknown) => taskEvents.snapshot(CancelUiCreationSchema.parse(input).taskId));
  ipcMain.handle('v3.ai.listTaskSnapshots', (_event, input: unknown = undefined) => taskEvents.list(V3TaskListSchema.parse(input)?.workspaceId));
  ipcMain.handle('v3.ai.cancelTaskStream', (_event, input: unknown) => {
    const taskId = CancelUiCreationSchema.parse(input).taskId;
    const controller = taskStreams.get(taskId);
    if (!controller) return;
    controller.abort();
    taskStreams.delete(taskId);
    retryableTasks.delete(taskId);
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
  ipcMain.handle('v3.ai.commitUiCandidate', async (_event, input: unknown) => { if (!creationService) throw new Error('UI creation service unavailable'); const id = CandidateIdSchema.parse(input).candidateId; const result = await creationService.commit(id); const saved = creationService.getCandidate(id); if (saved) taskEvents.completeCandidate(saved); return result; });
  ipcMain.handle('v3.ai.rejectUiCandidate', (_event, input: unknown) => { if (!creationService) throw new Error('UI creation service unavailable'); creationService.reject(CandidateIdSchema.parse(input).candidateId); });
  ipcMain.handle('v3.ai.cancelUiCreation', (_event, input: unknown) => { const taskId = CancelUiCreationSchema.parse(input).taskId; creationTasks.get(taskId)?.abort(); });
  ipcMain.handle('v3.revision.apply', async (_event, input: unknown) => {
    const request = RevisionInputSchema.parse(input);
    const revision = revisionServices.get(request.uiFile) ?? new RevisionService({
      apply: (source, operations, filePath) => applyOperations(parseUi(source, filePath), operations).source,
      validate: async (candidate, filePath) => {
        parseUi(candidate, filePath);
        const root = findProjectRoot(filePath); const config = root ? loadProjectConfig(root, resolveLocalQtToolchain(root, settingsRepository)?.qt) : undefined;
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
      retryableTasks.clear();
      if (componentCatalogReady) void componentCatalogReady.finally(() => componentCatalog.close());
      else componentCatalog.close();
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
      ipcMain.removeHandler?.('v3.workspace.readText');
      ipcMain.removeHandler?.('v3.workspace.writeText');
      ipcMain.removeHandler?.('v3.workspace.syncProjectProfile');
      ipcMain.removeHandler?.('v3.capabilities.search');
      ipcMain.removeHandler?.('v3.componentSources.list'); ipcMain.removeHandler?.('v3.componentSources.save'); ipcMain.removeHandler?.('v3.componentSources.remove'); ipcMain.removeHandler?.('v3.componentSources.test'); ipcMain.removeHandler?.('v3.componentSources.sync'); ipcMain.removeHandler?.('v3.componentSources.search'); ipcMain.removeHandler?.('v3.componentSources.preview');
      ipcMain.removeHandler?.('v3.workspace.tree'); ipcMain.removeHandler?.('v3.workspace.createFile'); ipcMain.removeHandler?.('v3.workspace.createDirectory'); ipcMain.removeHandler?.('v3.workspace.renameEntry'); ipcMain.removeHandler?.('v3.workspace.trashEntry'); ipcMain.removeHandler?.('v3.workspace.deleteEntryPermanently');
      ipcMain.removeHandler?.('v3.preview.render');
      ipcMain.removeHandler?.('v3.preview.cancel');
      ipcMain.removeHandler?.('v3.preview.openWindow');
      ipcMain.removeHandler?.('v3.ai.plan');
      ipcMain.removeHandler?.('v3.ai.planStream');
      ipcMain.removeHandler?.('v3.ai.startTaskStream');
      ipcMain.removeHandler?.('v3.ai.resumeTaskStream');
      ipcMain.removeHandler?.('v3.ai.getTaskSnapshot');
      ipcMain.removeHandler?.('v3.ai.listTaskSnapshots');
      ipcMain.removeHandler?.('v3.ai.cancelTaskStream');
      for (const controller of creationTasks.values()) controller.abort();
      creationTasks.clear();
      ipcMain.removeHandler?.('v3.ai.createUiCandidate');
      ipcMain.removeHandler?.('v3.ai.commitUiCandidate');
      ipcMain.removeHandler?.('v3.ai.rejectUiCandidate');
      ipcMain.removeHandler?.('v3.ai.cancelUiCreation');
      ipcMain.removeHandler?.('v3.revision.apply');
      ipcMain.removeHandler?.('v3.revision.undo'); ipcMain.removeHandler?.('v3.revision.redo'); ipcMain.removeHandler?.('v3.revision.rebase');
      componentSourceDatabase?.close();
    },
  };
}

export { OpenWorkspaceSchema, WorkspaceIdSchema };

export function resolveBundledComponentLibraryRoot(
  resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
  currentDirectory = process.cwd(),
  moduleDirectory = __dirname,
): string {
  const candidates = [
    resourcesPath ? join(resourcesPath, 'qt-ui-copilot-assets', 'component-library') : undefined,
    resourcesPath ? resolve(resourcesPath, '..', '..', 'resources', 'qt-ui-copilot-assets', 'component-library') : undefined,
    resolve(currentDirectory, 'resources', 'component-library'),
    resolve(currentDirectory, '..', '..', 'resources', 'component-library'),
    resolve(moduleDirectory, '../../../../../resources/component-library'),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? resolve(currentDirectory, 'resources/component-library');
}

export function resolveExternalComponentLibraryRoot(
  libraryId: string,
  resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
  currentDirectory = process.cwd(),
  moduleDirectory = __dirname,
): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(libraryId)) throw new Error(`Invalid external component library id: ${libraryId}`);
  const candidates = [
    resourcesPath ? join(resourcesPath, 'qt-ui-copilot-assets', 'component-libraries', libraryId) : undefined,
    resourcesPath ? resolve(resourcesPath, '..', '..', 'resources', 'qt-ui-copilot-assets', 'component-libraries', libraryId) : undefined,
    resolve(currentDirectory, 'resources', 'external-component-libraries', libraryId),
    resolve(currentDirectory, '..', '..', 'resources', 'external-component-libraries', libraryId),
    resolve(moduleDirectory, '../../../../../resources/external-component-libraries', libraryId),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? resolve(currentDirectory, 'resources/external-component-libraries', libraryId);
}
