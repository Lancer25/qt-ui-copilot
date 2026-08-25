import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { WorkspaceService } from '../workspace/workspace-service';
import { WorkspaceWatcher, type WorkspaceChange } from '../workspace/workspace-watcher';

const OpenWorkspaceSchema = z.object({ rootDir: z.string().min(1).max(4096), ignorePatterns: z.array(z.string().min(1).max(512)).max(128).optional() }).strict();
const WorkspaceIdSchema = z.object({ workspaceId: z.string().min(1).max(128) }).strict();

/** Registers the sandboxed V3 workspace boundary and returns its lifecycle cleanup. */
export function registerV3Ipc(window: BrowserWindow, service = new WorkspaceService()): { dispose(): void } {
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
  return {
    dispose() {
      for (const watcher of watchers.values()) watcher.stop();
      watchers.clear();
      ipcMain.removeHandler?.('v3.workspace.open');
      ipcMain.removeHandler?.('v3.workspace.listFiles');
    },
  };
}

export { OpenWorkspaceSchema, WorkspaceIdSchema };
