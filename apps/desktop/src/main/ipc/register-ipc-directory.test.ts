import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { createLocalBackend, registerIpc } from './register-ipc';

type IpcHandler = (event: unknown, input?: unknown) => Promise<unknown>;

function directoryHandler(): IpcHandler {
  const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, IpcHandler]> } }).mock.calls;
  const call = calls.find(([channel]) => channel === 'projects:chooseDirectory');
  if (!call) throw new Error('projects:chooseDirectory handler was not registered');
  return call[1] as IpcHandler;
}

describe('projects:chooseDirectory IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerIpc({ webContents: { send: vi.fn() } } as unknown as BrowserWindow, createLocalBackend());
  });

  it('returns the selected directory through the fixed Main-process dialog channel', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['D:/projects/qt-app'] } as never);

    await expect(directoryHandler()({})).resolves.toBe('D:/projects/qt-app');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.anything(), { properties: ['openDirectory'] });
  });

  it('returns undefined for a cancelled chooser and rejects unexpected renderer input', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] } as never);

    await expect(directoryHandler()({})).resolves.toBeUndefined();
    await expect(directoryHandler()({}, { rootDir: 'D:/should-not-be-accepted' })).rejects.toThrow();
  });
});
