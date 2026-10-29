import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type { V3TaskSnapshot } from '@qt-ui-copilot/contracts';
import { registerV3Ipc } from './register-v3-ipc';
import { QtBuildService } from '../build/qt-build-service';
import { resolvePreviewHostSource } from '../preview/preview-session-service';
import { WorkspaceService } from '../workspace/workspace-service';
import { openDatabase, V3Repository } from '@qt-ui-copilot/task-store';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBundledComponentLibraryRoot, resolveExternalComponentLibraryRoot, workspaceRelativeBuildPath } from './register-v3-ipc';
import { validateUiWithUic } from '@qt-ui-copilot/project-core';

// Spying keeps every real export of the toolchain package while letting a single
// test replace the one boundary a unit environment cannot provide: a working Qt
// uic. The .ui validation itself is covered where a real Kit exists.
vi.mock('@qt-ui-copilot/project-core', { spy: true });

describe('V3 workspace IPC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers open and list handlers at the typed boundary', () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    expect(calls.some(([channel]) => channel === 'v3.workspace.open')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.workspace.listFiles')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.workspace.syncProjectProfile')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.ai.resumeTaskStream')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.ai.listTaskSnapshots')).toBe(true);
    expect(calls.some(([channel]) => channel === 'v3.componentSources.list')).toBe(true);
    lifecycle.dispose();
  });

  it('lists and restores persisted V3 tasks instead of legacy task rows', async () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveTaskSnapshot({
      workspaceId: 'workspace-1', title: '创建登录页', targetPath: 'ui/Login.ui',
      snapshot: { taskId: 'task-1', status: 'completed', lastSequence: 1, events: [{ taskId: 'task-1', sequence: 1, timestamp: 2, lane: 'conversation', type: 'done', status: 'completed', title: '完成' }], createdAt: 1, updatedAt: 2 },
    });
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, undefined, repository);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const list = calls.find(([channel]) => channel === 'v3.ai.listTaskSnapshots')?.[1];
    const get = calls.find(([channel]) => channel === 'v3.ai.getTaskSnapshot')?.[1];

    expect(await list?.({}, { workspaceId: 'workspace-1' })).toEqual([expect.objectContaining({ taskId: 'task-1', status: 'completed' })]);
    expect(await get?.({}, { taskId: 'task-1' })).toMatchObject({ taskId: 'task-1', events: [expect.objectContaining({ title: '完成' })] });
    lifecycle.dispose();
    database.close();
  });

  it('resolves the bundled PreviewHost when a project root is not a CMake source', () => {
    const resolved = resolvePreviewHostSource('C:/Users/Lancer/Desktop/qtDemo');
    expect(resolved.replaceAll('\\', '/')).toContain('native/qt-ui-preview-host');
  });

  it('resolves component assets from the portable launcher resources directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-portable-'));
    const resourcesPath = join(root, 'runtime', 'resources');
    const expected = join(root, 'resources', 'qt-ui-copilot-assets', 'component-library');
    mkdirSync(resourcesPath, { recursive: true });
    mkdirSync(expected, { recursive: true });
    expect(resolveBundledComponentLibraryRoot(resourcesPath, join(root, 'unrelated'), join(root, 'resources', 'app', '.vite', 'build'))).toBe(expected);
  });

  it('resolves an external component source from portable launcher resources', () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-external-source-'));
    const resourcesPath = join(root, 'runtime', 'resources');
    const expected = join(root, 'resources', 'qt-ui-copilot-assets', 'component-libraries', 'gtronick-qss');
    mkdirSync(resourcesPath, { recursive: true });
    mkdirSync(expected, { recursive: true });
    expect(resolveExternalComponentLibraryRoot('gtronick-qss', resourcesPath, join(root, 'unrelated'), join(root, 'resources', 'app', '.vite', 'build'))).toBe(expected);
  });

  it('exposes version-filtered Qt capability candidates', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.capabilities.search')?.[1];
    const result = await handler?.({}, { workspaceId: 'w', text: 'status', kit: { version: '5.9.6', modules: ['Widgets'] } });
    expect(result.some((item: { capabilityId: string }) => item.capabilityId === 'qt.widgets.QStatusBar')).toBe(true);
    const components = await handler?.({}, { workspaceId: 'w', text: '登录', kind: 'ui_fragment', kit: { version: '5.9.6', modules: ['Widgets'] } });
    expect(components).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: 'bundled', componentId: 'login-card', dependencyStatus: 'ready' })]));
    lifecycle.dispose();
  });

  it('allows the binary mapping editor to request a paged source candidate list', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.componentSources.search')?.[1];
    await expect(handler?.({}, { workspaceId: 'mapping', sourceId: 'bundled', limit: 100, offset: 100, kit: { version: '5.9.6', modules: ['Widgets'] } })).resolves.toBeInstanceOf(Array);
    lifecycle.dispose();
  });

  it('rejects malformed open input before invoking the service', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.workspace.open')?.[1];
    await expect(handler?.({}, { rootDir: '' })).rejects.toThrow();
  });

  it('only accepts portable profiles at the project-sync IPC boundary', async () => {
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService());
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const handler = calls.find(([channel]) => channel === 'v3.workspace.syncProjectProfile')?.[1];

    let result = 'accepted';
    try {
      await handler?.({}, { workspaceId: 'w', profile: { id: 'demo', qt: { version: '6.0', compilerAbi: 'msvc', architecture: 'x86_64', uic: 'C:/Qt/bin/uic.exe' }, build: { backend: 'auto' } } });
    } catch {
      result = 'rejected';
    }
    expect(result).toBe('rejected');
    lifecycle.dispose();
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
    const provider = { generate: vi.fn(() => new Promise((resolve) => { resolveModel = resolve; })).mockResolvedValueOnce({ action: 'ui', reply: '' }) };
    const send = vi.fn();
    const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, provider);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const start = calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1];

    const result = await start?.({}, { kind: 'modify', taskId: 'stream-1', request: { requirement: '增加按钮', uiFile: 'D:/demo/Main.ui', uiContent: '<ui/>', contextMode: 'focused_ui' } });
    expect(result).toEqual({ taskId: 'stream-1' });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('v3.ai.taskEvent', expect.objectContaining({ taskId: 'stream-1', type: 'status', status: 'running' })));
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledTimes(2));

    resolveModel?.({ summary: '已生成修改方案', riskLevel: 'low', operations: [{ op: 'setProperty', target: 'titleLabel', name: 'text', value: '新标题' }], expectedResults: [], componentIds: [] });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('v3.ai.taskEvent', expect.objectContaining({ taskId: 'stream-1', type: 'message_delta', detail: '已生成修改方案' })));
    lifecycle.dispose();
  });

  it('starts an image-only creation task instead of rejecting it for a missing title', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    const provider = { generate: vi.fn(async () => ({ action: 'ui', reply: '' })) };
    const window = { webContents: { send: vi.fn() }, isDestroyed: () => false } as unknown as BrowserWindow;
    const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, provider, repository);
    const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
    const start = calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1];

    // The contract and the attachment design both allow "reference image, no
    // text", so Main must not persist an empty history title and fail the task.
    const result = start?.({}, {
      kind: 'create', taskId: 'stream-image-only',
      request: {
        workspaceId: 'workspace-1', requirement: '', fileName: 'Login.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '5.9.6',
        attachments: [{ id: 'attachment-1', name: 'login.png', kind: 'image', mimeType: 'image/png', size: 4096, contentHash: 'a'.repeat(64), dataUrl: 'data:image/png;base64,AAAA' }],
      },
    });
    expect(result).toEqual({ taskId: 'stream-image-only' });
    expect(repository.getTaskHistoryItem('stream-image-only')?.title).toBe('login.png');
    lifecycle.dispose();
  });

  it('cancels a running stream in Main and records a cancellation event', async () => {    const provider = { generate: vi.fn(() => new Promise(() => undefined)) };
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

  // The reported bug: the user bound a Qt Kit, yet every task demanded another
  // binding. A portable project profile records only the Qt identity, so the
  // bound Kit has to supply the tool paths the file deliberately omits.
  const portableProject = (root: string, declaration = { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' }) => {
    mkdirSync(join(root, '.qt-ui-copilot'), { recursive: true });
    writeFileSync(join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify({ id: 'demo', qt: declaration, build: { backend: 'auto', directory: '.qt-ui-copilot/build' }, run: { executable: '.qt-ui-copilot/build/Debug/demo.exe' } }));
  };
  const boundKit = (root: string, overrides: Record<string, unknown> = {}) => {
    const bin = join(root, 'Qt5.9.6', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'uic.exe'), '');
    writeFileSync(join(bin, 'rcc.exe'), '');
    return { id: 'qt-5.9.6', displayName: 'Qt 5.9.6', config: { version: '5.9.6', qtMajor: 5, rootDir: join(root, 'Qt5.9.6'), binDirectory: bin, uic: join(bin, 'uic.exe'), rcc: join(bin, 'rcc.exe'), compilerAbi: 'msvc2015_64', architecture: 'x86_64', ...overrides } };
  };
  const taskEventsOf = (send: ReturnType<typeof vi.fn>) => send.mock.calls.filter(([channel]) => channel === 'v3.ai.taskEvent').map(([, event]) => event as { type: string; stage?: string; detail?: string });

  it('runs a portable project with the locally bound Qt Kit instead of demanding another binding', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-bound-'));
    try {
      portableProject(root);
      const send = vi.fn();
      const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
      const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, { generate: vi.fn() }, undefined, undefined, { listQtKits: () => [boundKit(root)] });
      const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
      const summary = await calls.find(([channel]) => channel === 'v3.workspace.open')?.[1]({}, { rootDir: root });
      await calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1]({}, { kind: 'create', taskId: 'bound-kit', request: { workspaceId: summary.id, requirement: '请重新构建项目', fileName: 'Main.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '6.10.2', attachments: [] } });

      await vi.waitFor(() => expect(taskEventsOf(send).some((event) => event.type === 'error')).toBe(true));
      const events = taskEventsOf(send);
      // The task now reaches the build instead of failing on the Qt Kit requirement.
      expect(events.find((event) => event.type === 'error')?.detail).toContain('Unable to detect build backend');
      expect(events.find((event) => event.type === 'error')?.detail).not.toContain('Qt Kit');
      expect(events.some((event) => event.stage === 'qt_kit_mismatch' && event.type === 'warning')).toBe(true);
      expect(await calls.find(([channel]) => channel === 'v3.ai.resumeTaskStream')?.[1]({}, { taskId: 'bound-kit' })).toEqual({ resumed: false });
      lifecycle.dispose();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reports an unbound portable project as a configuration request instead of a schema error', async () => {    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-unbound-'));
    try {
      portableProject(root);
      const send = vi.fn();
      const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
      const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, { generate: vi.fn() });
      const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
      const summary = await calls.find(([channel]) => channel === 'v3.workspace.open')?.[1]({}, { rootDir: root });
      await calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1]({}, { kind: 'create', taskId: 'unbound-kit', request: { workspaceId: summary.id, requirement: '请重新构建项目', fileName: 'Main.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '6.10.2', attachments: [] } });

      await vi.waitFor(() => expect(taskEventsOf(send).some((event) => event.type === 'error')).toBe(true));
      expect(taskEventsOf(send).find((event) => event.type === 'error')?.detail).toContain('项目构建配置不完整，请在设置中保存 Qt Kit 和构建配置');
      expect(await calls.find(([channel]) => channel === 'v3.ai.resumeTaskStream')?.[1]({}, { taskId: 'unbound-kit' })).toEqual({ resumed: true });
      lifecycle.dispose();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('builds a newly scaffolded project with the locally bound Qt Kit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-scaffold-'));
    // The stubbed uic is the only stand-in here: the scaffold has to clear .ui
    // validation before the task can reach the project-build step.
    vi.mocked(validateUiWithUic).mockResolvedValue({ executable: 'uic', args: [], stdout: '', stderr: '', exitCode: 0, timedOut: false, outputPath: join(root, 'ui_validation.h'), valid: true });
    try {
      portableProject(root);
      // A MinGW Kit keeps the step under test hermetic: an MSVC one probes the
      // Visual Studio environment before it looks for qmake.
      const kit = boundKit(root, { compilerAbi: 'mingw73_64' });
      const send = vi.fn();
      // Any shape the model returns is normalized by the planners; the staged
      // scaffold only needs to reach the project-build step.
      const generate = vi.fn(async () => ({ fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'mainWidget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['可编译'] }));
      const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
      const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, { generate }, undefined, undefined, { listQtKits: () => [kit] });
      const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
      const summary = await calls.find(([channel]) => channel === 'v3.workspace.open')?.[1]({}, { rootDir: root });
      await calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1]({}, { kind: 'create', taskId: 'scaffolded-project', request: { workspaceId: summary.id, requirement: '', fileName: 'Main.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '6.10.2', createProject: true, attachments: [{ id: 'attachment-1', name: 'login.png', kind: 'image', mimeType: 'image/png', size: 3, contentHash: '709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c', dataUrl: 'data:image/png;base64,AAAA' }] } });

      await vi.waitFor(() => expect(taskEventsOf(send).some((event) => event.type === 'error')).toBe(true));
      const events = taskEventsOf(send);
      const detail = events.find((event) => event.type === 'error')?.detail ?? '';
      // The project-build step runs with the bound Kit's tool directory rather
      // than claiming the project has no Qt build configuration: it asks that
      // Kit for its qmake, which the fixture deliberately does not ship.
      expect(detail).toContain('QMake executable was not found');
      expect(detail).toContain(join(root, 'Qt5.9.6', 'bin'));
      expect(detail).not.toContain('Qt Kit');
      // Announcing the version fallback proves this step consulted the binding
      // rather than failing before it.
      expect(events.some((event) => event.type === 'warning' && event.stage === 'qt_kit_mismatch')).toBe(true);
      // A missing qmake is a real build failure, not a configuration request the
      // user can answer by binding the Kit they already bound.
      expect(await calls.find(([channel]) => channel === 'v3.ai.resumeTaskStream')?.[1]({}, { taskId: 'scaffolded-project' })).toEqual({ resumed: false });
      lifecycle.dispose();
    // Reset, not restore: restoring would remove the module spy the next test
    // re-arms with its own stub.
    } finally { vi.mocked(validateUiWithUic).mockReset(); rmSync(root, { recursive: true, force: true }); }
  });

  it('records a scaffolded build as paths relative to the workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-relative-'));
    // The only boundary stubbed here is the compile itself, which is what a unit
    // environment cannot provide; the snapshot write below is the real repository.
    vi.mocked(validateUiWithUic).mockResolvedValue({ executable: 'uic', args: [], stdout: '', stderr: '', exitCode: 0, timedOut: false, outputPath: join(root, 'ui_validation.h'), valid: true });
    const staged = join(root, '.qt-ui-copilot', 'candidates', 'ui-creation-1');
    const build = vi.spyOn(QtBuildService.prototype, 'build').mockResolvedValue({ executable: join(staged, '.build', 'release', 'demo.exe'), buildDirectory: join(staged, '.build'), backend: 'qmake' });
    const database = openDatabase(':memory:');
    try {
      portableProject(root);
      const send = vi.fn();
      const generate = vi.fn(async () => ({ fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'mainWidget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['可编译'] }));
      const window = { webContents: { send }, isDestroyed: () => false } as unknown as BrowserWindow;
      const lifecycle = registerV3Ipc(window, new WorkspaceService(), undefined, { generate }, new V3Repository(database), undefined, { listQtKits: () => [boundKit(root, { compilerAbi: 'mingw73_64' })] });
      const calls = (ipcMain.handle as unknown as { mock: { calls: Array<[string, Function]> } }).mock.calls;
      const summary = await calls.find(([channel]) => channel === 'v3.workspace.open')?.[1]({}, { rootDir: root });
      await calls.find(([channel]) => channel === 'v3.ai.startTaskStream')?.[1]({}, { kind: 'create', taskId: 'relative-build', request: { workspaceId: summary.id, requirement: '', fileName: 'Main.ui', rootType: 'QWidget', directory: 'ui', qtKitId: '6.10.2', createProject: true, attachments: [{ id: 'attachment-1', name: 'login.png', kind: 'image', mimeType: 'image/png', size: 3, contentHash: '709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c', dataUrl: 'data:image/png;base64,AAAA' }] } });

      // The reported task died exactly here: a successful compile whose absolute
      // output paths the snapshot schema rejects, which surfaced as an unhandled
      // rejection and hid the compile result.
      const snapshotOf = () => calls.find(([channel]) => channel === 'v3.ai.getTaskSnapshot')?.[1]({}, { taskId: 'relative-build' }) as Promise<V3TaskSnapshot | undefined>;
      await vi.waitFor(async () => expect((await snapshotOf())?.candidate?.executable).toBe('.qt-ui-copilot/candidates/ui-creation-1/.build/release/demo.exe'));
      expect((await snapshotOf())?.candidate?.buildDirectory).toBe('.qt-ui-copilot/candidates/ui-creation-1/.build');
      expect(new V3Repository(database).getTaskSnapshot('relative-build')?.candidate?.executable).toBe('.qt-ui-copilot/candidates/ui-creation-1/.build/release/demo.exe');
      // A build failure is not a missing Kit binding, so the task must not ask to
      // be resumed into the same wall.
      expect(await calls.find(([channel]) => channel === 'v3.ai.resumeTaskStream')?.[1]({}, { taskId: 'relative-build' })).toEqual({ resumed: false });
      lifecycle.dispose();
    } finally { build.mockRestore(); vi.mocked(validateUiWithUic).mockRestore(); rmSync(root, { recursive: true, force: true }); database.close(); }
  });
});

describe('candidate build paths', () => {
  it('expresses a build inside the workspace as a relative path', () => {
    expect(workspaceRelativeBuildPath('D:/demo', 'D:/demo/.qt-ui-copilot/build/app.exe')).toBe('.qt-ui-copilot/build/app.exe');
  });

  // path.relative reports separators the host platform uses, and this ships as a
  // Windows build, so the normalization is asserted where it actually applies.
  it.skipIf(process.platform !== 'win32')('normalizes the separators Windows reports', () => {
    expect(workspaceRelativeBuildPath('D:/demo', 'D:\\demo\\build\\Debug\\app.exe')).toBe('build/Debug/app.exe');
  });

  it('refuses a path no portable project file could hold', () => {
    // The exact value that broke the reported task: a staged build root outside
    // the workspace, which the snapshot schema rejects as `..` escaping it.
    expect(workspaceRelativeBuildPath('D:/demo', 'D:/demo/../staged/.build')).toBeUndefined();
    expect(workspaceRelativeBuildPath('D:/demo', 'E:/tmp/staged/.build')).toBeUndefined();
    expect(workspaceRelativeBuildPath('D:/demo', 'D:/demo')).toBeUndefined();
  });
});
