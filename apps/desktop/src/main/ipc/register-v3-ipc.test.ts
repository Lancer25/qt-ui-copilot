import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { registerV3Ipc } from './register-v3-ipc';
import { WorkspaceService } from '../workspace/workspace-service';

describe('V3 workspace IPC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers open and list handlers at the typed boundary', () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    expect(calls.some(([channel]) => channel === 'v3.workspace.open')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.workspace.listFiles')).toBe(true);
    lifecycle.dispose();
  });

  it('rejects malformed open input before invoking the service', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.workspace.open')?.[1];
    await expect(handler?.({}, { rootDir: '' })).rejects.toThrow();
  });
});

