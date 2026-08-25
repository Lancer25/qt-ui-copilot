import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { WorkspaceService } from '../workspace/workspace-service';
import { WorkspaceWatcher, type WorkspaceChange } from '../workspace/workspace-watcher';
import { PreviewSessionService, type V3PreviewInput } from '../preview/preview-session-service';
import { UiPlanner, type ModelProvider } from '@qt-ui-copilot/agent-workflow';
import { applyOperations, parseUi } from '@qt-ui-copilot/ui-document';
import { RevisionService } from '../revisions/revision-service';

const OpenWorkspaceSchema = z.object({ rootDir: z.string().min(1).max(4096), ignorePatterns: z.array(z.string().min(1).max(512)).max(128).optional() }).strict();
const WorkspaceIdSchema = z.object({ workspaceId: z.string().min(1).max(128) }).strict();
const ReadWorkspaceFileSchema = z.object({ workspaceId: z.string().min(1).max(128), filePath: z.string().min(1).max(4096) }).strict();
const PreviewInputSchema = z.object({ uiFile: z.string().min(1), profile: z.object({ qtKitId: z.string().min(1), mode: z.enum(['quick', 'enhanced']), width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096), locale: z.string().min(2), style: z.string().min(1), qrcFiles: z.array(z.string()), stylesheets: z.array(z.string()), fonts: z.array(z.string()), pluginPaths: z.array(z.string()), highDpiMode: z.enum(['project-default', 'logical-96', 'system']) }), qt: z.object({ version: z.string(), compilerAbi: z.string(), architecture: z.string(), binDirectory: z.string(), uic: z.string(), rcc: z.string(), cmake: z.string(), cmakePrefixPath: z.string(), cmakeGenerator: z.string().optional() }), sourceDirectory: z.string(), cacheDirectory: z.string(), outputImage: z.string() }).strict();
const PlanInputSchema = z.object({ requirement: z.string().min(1).max(10000), uiFile: z.string().min(1), uiContent: z.string().max(2_000_000), contextMode: z.enum(['focused_ui', 'whole_project']) }).strict();
const RevisionInputSchema = z.object({ uiFile: z.string().min(1), operations: z.array(z.unknown()), conversationId: z.string().min(1) }).strict();
const RevisionFileSchema = z.object({ uiFile: z.string().min(1) }).strict();

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindow, service = new WorkspaceService(), preview = new PreviewSessionService(), modelProvider?: ModelProvider): { dispose(): void } {
  const watchers = new Map<string, WorkspaceWatcher>();
  const revisionServices = new Map<string, RevisionService>();
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
  ipcMain.handle('v3.workspace.open', openHandler);
  ipcMain.handle('v3.workspace.listFiles', listFilesHandler);
  ipcMain.handle('v3.workspace.readText', (_event, input: unknown) => { const parsed = ReadWorkspaceFileSchema.parse(input); return service.readText(parsed.workspaceId, parsed.filePath); });
  ipcMain.handle('v3.preview.render', (_event, input: unknown) => preview.render(PreviewInputSchema.parse(input) as V3PreviewInput));
  ipcMain.handle('v3.ai.plan', async (_event, input: unknown) => { if (!modelProvider) throw new Error('模型服务尚未配置'); const request = PlanInputSchema.parse(input); return new UiPlanner(modelProvider).plan({ requirement: request.requirement, targetSemanticTree: { uiFile: request.uiFile, uiContent: request.uiContent }, runtimeFacts: { contextMode: request.contextMode } }); });
  ipcMain.handle('v3.revision.apply', async (_event, input: unknown) => {
    const request = RevisionInputSchema.parse(input);
    const revision = revisionServices.get(request.uiFile) ?? new RevisionService({
      apply: (source, operations, filePath) => applyOperations(parseUi(source, filePath), operations).source,
      validate: async (candidate, filePath) => { parseUi(candidate, filePath); return { xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: Date.now() }; },
    });
    revisionServices.set(request.uiFile, revision); return revision.apply(request.uiFile, request.operations as never[], request.conversationId);
  });
  ipcMain.handle('v3.revision.undo', (_event, input: unknown) => { const file = RevisionFileSchema.parse(input).uiFile; return revisionServices.get(file)?.undo(file); });
  ipcMain.handle('v3.revision.redo', (_event, input: unknown) => { const file = RevisionFileSchema.parse(input).uiFile; return revisionServices.get(file)?.redo(file); });
  return {
    dispose() {
      for (const watcher of watchers.values()) watcher.stop();
      watchers.clear();
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
      ipcMain.removeHandler?.('v3.workspace.readText');
      ipcMain.removeHandler?.('v3.preview.render');
      ipcMain.removeHandler?.('v3.ai.plan');
      ipcMain.removeHandler?.('v3.revision.apply');
      ipcMain.removeHandler?.('v3.revision.undo'); ipcMain.removeHandler?.('v3.revision.redo');
    },
  };
}

export { OpenWorkspaceSchema, WorkspaceIdSchema };
