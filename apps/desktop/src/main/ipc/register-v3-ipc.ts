import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { WorkspaceService } from '../workspace/workspace-service';
import { WorkspaceWatcher, type WorkspaceChange } from '../workspace/workspace-watcher';
import { PreviewSessionService, type V3PreviewInput } from '../preview/preview-session-service';

const OpenWorkspaceSchema = z.object({ rootDir: z.string().min(1).max(4096), ignorePatterns: z.array(z.string().min(1).max(512)).max(128).optional() }).strict();
const WorkspaceIdSchema = z.object({ workspaceId: z.string().min(1).max(128) }).strict();
const PreviewInputSchema = z.object({ uiFile: z.string().min(1), profile: z.object({ qtKitId: z.string().min(1), mode: z.enum(['quick', 'enhanced']), width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096), locale: z.string().min(2), style: z.string().min(1), qrcFiles: z.array(z.string()), stylesheets: z.array(z.string()), fonts: z.array(z.string()), pluginPaths: z.array(z.string()), highDpiMode: z.enum(['project-default', 'logical-96', 'system']) }), qt: z.object({ version: z.string(), compilerAbi: z.string(), architecture: z.string(), binDirectory: z.string(), uic: z.string(), rcc: z.string(), cmake: z.string(), cmakePrefixPath: z.string(), cmakeGenerator: z.string().optional() }), sourceDirectory: z.string(), cacheDirectory: z.string(), outputImage: z.string() }).strict();

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindow, service = new WorkspaceService(), preview = new PreviewSessionService()): { dispose(): void } {
  const watchers = new Map<string, WorkspaceWatcher>();
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
  ipcMain.handle('v3.preview.render', (_event, input: unknown) => preview.render(PreviewInputSchema.parse(input) as V3PreviewInput));
  return {
    dispose() {
      for (const watcher of watchers.values()) watcher.stop();
      watchers.clear();
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
      ipcMain.removeHandler?.('v3.preview.render');
    },
  };
}

export { OpenWorkspaceSchema, WorkspaceIdSchema };
