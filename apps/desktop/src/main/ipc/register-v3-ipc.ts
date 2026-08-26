import { ipcMain, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';
import { z } from 'zod';
import { WorkspaceService } from '../workspace/workspace-service';
import { WorkspaceWatcher, type WorkspaceChange } from '../workspace/workspace-watcher';
import { PreviewSessionService, type V3PreviewInput } from '../preview/preview-session-service';
import { UiPlanner, type ModelProvider } from '@qt-ui-copilot/agent-workflow';
import { loadProjectConfig, profileFromConfig, validateUiWithUic } from '@qt-ui-copilot/project-core';
import { applyOperations, parseUi } from '@qt-ui-copilot/ui-document';
import { RevisionService } from '../revisions/revision-service';
import { ContextService } from '../ai/context-service';
import { ConversationService } from '../ai/conversation-service';
import { UiCreationRequestSchema, type UiCreationRequest } from '@qt-ui-copilot/contracts';
import { AttachmentService } from '../ai/attachment-service';
import { UiCreationPlanner } from '../ai/ui-creation-planner';
import { UiCreationService } from '../ai/ui-creation-service';
import { UiCreationTaskService } from '../ai/ui-creation-task-service';
import { UiIntentPlanner } from '../ai/ui-intent-planner';
import { UiEnhancementPlanner } from '../ai/ui-enhancement-planner';

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

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindow, service = new WorkspaceService(), preview = new PreviewSessionService(), modelProvider?: ModelProvider): { dispose(): void } {
  const watchers = new Map<string, WorkspaceWatcher>();
  const revisionServices = new Map<string, RevisionService>();
  const creationTasks = new Map<string, AbortController>();
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
  ipcMain.handle('v3.workspace.open', openHandler);
  ipcMain.handle('v3.workspace.listFiles', listFilesHandler);
  ipcMain.handle('v3.workspace.readText', (_event, input: unknown) => { const parsed = ReadWorkspaceFileSchema.parse(input); return service.readText(parsed.workspaceId, parsed.filePath); });
  ipcMain.handle('v3.workspace.writeText', (_event, input: unknown) => { const parsed = WriteWorkspaceFileSchema.parse(input); return service.writeText(parsed.workspaceId, parsed.filePath, parsed.content); });
  ipcMain.handle('v3.preview.render', (_event, input: unknown) => preview.render(PreviewInputSchema.parse(input) as V3PreviewInput));
  ipcMain.handle('v3.preview.cancel', (_event, input: unknown) => { preview.cancel(PreviewCancelSchema.parse(input).uiFile); });
  ipcMain.handle('v3.ai.plan', async (_event, input: unknown) => { if (!modelProvider) throw new Error('模型服务尚未配置'); const request = PlanInputSchema.parse(input); let context: Record<string, unknown> = { uiFile: request.uiFile, uiContent: request.uiContent }; if (request.contextMode === 'whole_project' && request.workspaceId) { const files = await service.listFiles(request.workspaceId); context = { ...context, projectSearch: await new ContextService((filePath) => service.readText(request.workspaceId!, filePath)).searchWholeProject(request.requirement, files as never[]) }; } return new UiPlanner(modelProvider).plan({ requirement: request.requirement, targetSemanticTree: context, runtimeFacts: { contextMode: request.contextMode } }); });
  ipcMain.handle('v3.ai.planStream', async (_event, input: unknown) => { if (!modelProvider) throw new Error('模型服务尚未配置'); const request = PlanInputSchema.parse(input); let targetSemanticTree: Record<string, unknown> = { uiFile: request.uiFile, uiContent: request.uiContent }; if (request.workspaceId) { const files = await service.listFiles(request.workspaceId); const contextService = new ContextService((filePath) => service.readText(request.workspaceId!, filePath)); if (request.contextMode === 'whole_project') targetSemanticTree = { ...targetSemanticTree, projectSearch: await contextService.searchWholeProject(request.requirement, files as never[]) }; else { const uiFile = files.find((file) => file.absolutePath === request.uiFile || file.relativePath === request.uiFile); if (uiFile) targetSemanticTree = { ...(await contextService.buildFocusedUiContext(uiFile as never, files as never[])) as unknown as Record<string, unknown> }; } } const events = []; const context = { requirement: request.requirement, targetSemanticTree, runtimeFacts: { contextMode: request.contextMode } }; for await (const event of new ConversationService(modelProvider).plan(`v3-${request.uiFile}`, context)) events.push(event); return events; });
  ipcMain.handle('v3.ai.createUiCandidate', async (_event, input: unknown) => {
    if (!creationService) throw new Error('模型服务尚未配置');
    const parsed = UiCreationIpcSchema.parse(input);
    const taskId = parsed.taskId ?? `ui-create-${Date.now()}`;
    const controller = new AbortController(); creationTasks.set(taskId, controller);
    try {
      if (controller.signal.aborted) throw new Error('UI creation cancelled');
      const { taskId: _taskId, ...request } = parsed;
      return await creationService.createCandidate(request as UiCreationRequest);
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
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
      ipcMain.removeHandler?.('v3.workspace.readText');
      ipcMain.removeHandler?.('v3.workspace.writeText');
      ipcMain.removeHandler?.('v3.preview.render');
      ipcMain.removeHandler?.('v3.preview.cancel');
      ipcMain.removeHandler?.('v3.ai.plan');
      ipcMain.removeHandler?.('v3.ai.planStream');
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
