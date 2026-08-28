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

  it('exposes version-filtered Qt capability candidates', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.capabilities.search')?.[1];
    const result = await handler?.({}, { workspaceId: 'w', text: 'status', kit: { version: '5.9.6', modules: ['Widgets'] } });
    expect(result.some((item: { capabilityId: string }) => item.capabilityId === 'qt.widgets.QStatusBar')).toBe(true);
    lifecycle.dispose();
  });

  it('rejects malformed open input before invoking the service', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.workspace.open')?.[1];
    await expect(handler?.({}, { rootDir: '' })).rejects.toThrow();
  });

  it('registers UI creation methods and rejects malformed attachment envelopes at the IPC boundary', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const provider = { generate: vi.fn() };
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, provider);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    expect(calls.some(([channel]) => channel === 'v3.ai.createUiCandidate')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.ai.commitUiCandidate')).toBe(true);
    const handler = calls.find(([channel]) => channel === 'v3.ai.createUiCandidate')?.[1];
    expect(handler).toBeDefined();
    await expect(handler?.({}, { workspaceId: 'w', requirement: 'x', attachments: [{ name: 'bad.exe' }], fileName: 'x.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '5.9.6' })).rejects.toThrow();
    lifecycle.dispose();
  });

  it('streams model events to the window before the asynchronous task finishes', async () => {
    let resolveModel: ((value: { summary: string; riskLevel: 'low'; operations: Array<{ op: 'setProperty'; target: string; name: string; value: string }>; expectedResults: []; componentIds: [] }) => void) | undefined;
    const provider = { generate: vi.fn(() => new Promise((resolve) => { resolveModel = resolve; })) };
    const send = vi.fn();
    const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, provider);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const start = calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1];

    const result = await start?.({}, { kind: 'modify', taskId: 'stream-1', request: { requirement: '增加按钮', uiFile: 'D:/demo/Main.ui', uiContent: '<ui/>', contextMode: 'focused_ui' } });
    expect(result).toEqual({ taskId: 'stream-1' });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('v3.ai.taskEvent', expect.objectContaining({ taskId: 'stream-1', type: 'status', status: 'running' })));
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalled());

    resolveModel?.({ summary: '已生成修改方案', riskLevel: 'low', operations: [{ op: 'setProperty', target: 'titleLabel', name: 'text', value: '新标题' }], expectedResults: [], componentIds: [] });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('v3.ai.taskEvent', expect.objectContaining({ taskId: 'stream-1', type: 'message_delta', detail: '已生成修改方案' })));
    lifecycle.dispose();
  });

  it('cancels a running stream in Main and records a cancellation event', async () => {
    const provider = { generate: vi.fn(() => new Promise(() => undefined)) };
    const send = vi.fn();
    const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, provider);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const start = calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1];
    const cancel = calls.find(([channel]) => channel === 'v3.ai.cancelTaskStream')?.[1];
    const snapshot = calls.find(([channel]) => channel === 'v3.ai.getTaskSnapshot')?.[1];

    await start?.({}, { kind: 'modify', taskId: 'stream-cancel', request: { requirement: '增加按钮', uiFile: 'D:/demo/Main.ui', uiContent: '<ui/>', contextMode: 'focused_ui' } });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalled());
    await cancel?.({}, { taskId: 'stream-cancel' });

    expect(await snapshot?.({}, { taskId: 'stream-cancel' })).toMatchObject({ status: 'cancelled' });
    expect(send).toHaveBeenCalledWith('v3.ai.taskEvent', expect.objectContaining({ type: 'cancelled', taskId: 'stream-cancel' }));
    lifecycle.dispose();
  });
});
