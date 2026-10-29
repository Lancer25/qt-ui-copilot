// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { V3TaskSnapshot } from '@qt-ui-copilot/contracts';
import { nextUiFileName, V3App } from './V3App';
import type { DesktopApi } from '../lib/api';

const api = { workspace: { open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 1, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { qt: { version: '6.10.2' }, preview: {} }, files: [{ absolutePath: 'D:/demo/Settings.ui', relativePath: 'ui/Settings.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'x' }] }), listFiles: async () => [], onChange: () => () => {} }, projects: { chooseDirectory: async () => 'D:/demo' }, preview: { render: async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 0.9 }) }, settings: { getModel: async () => ({ baseUrl: 'http://localhost:11434/v1', model: 'fake', imagePayloadMode: 'base64_data_url' as const, hasApiKey: false }), configureModel: async () => ({ baseUrl: 'http://localhost:11434/v1', model: 'fake', imagePayloadMode: 'base64_data_url' as const, hasApiKey: false }), testModel: async () => ({ ok: true, elapsedMs: 1, model: 'fake' }), testModelCapability: async ({ capability }: { capability: 'text' | 'json' | 'vision' }) => ({ capability, ok: true, elapsedMs: 1, model: 'fake' }), getProjectBinding: async () => undefined, saveProjectBinding: async () => ({ projectId: 'w', qtKitId: 'kit', config: {} }), checkProjectBinding: async () => ({ ok: true, blocking: [] }) } } as unknown as DesktopApi;
afterEach(cleanup);
describe('V3App', () => {
  it('chooses the next available filename for repeated new UI creation', () => {
    const summary = { id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 2, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [
      { absolutePath: 'D:/demo/ui/NewWidget.ui', relativePath: 'ui/NewWidget.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'a' },
      { absolutePath: 'D:/demo/ui/NewWidget_2.ui', relativePath: 'ui/NewWidget_2.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'b' },
    ] };
    expect(nextUiFileName(summary)).toBe('NewWidget_3.ui');
  });

  it('uses the central AI workspace and opens a UI file in a preview tab', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);
    expect(screen.getByRole('main', { name: 'AI 工作区' })).toBeTruthy();
    expect(screen.queryByLabelText('AI 助手')).toBeNull();
    expect(screen.getByRole('tab', { name: /AI 任务/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    expect(screen.getByRole('tab', { name: 'Settings.ui' })).toBeTruthy();
    expect(screen.getByLabelText('Qt 预览')).toBeTruthy();
  });

  it('returns to creation mode after closing the selected UI preview', async () => {
    const startTaskStream = vi.fn(async () => ({ taskId: 'workspace:w' }));
    const closeApi = {
      ...api,
      ai: {
        startTaskStream,
        getTaskSnapshot: async () => undefined,
        onTaskEvent: () => () => {},
      },
    } as unknown as DesktopApi;
    const user = userEvent.setup();
    render(<V3App api={closeApi} />);

    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    await user.click(screen.getByRole('button', { name: '关闭 Settings.ui' }));

    expect(screen.getByRole('button', { name: /引用组件库/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '完整应用' })).toBeTruthy();
    await user.type(screen.getByLabelText('发送给 AI'), '创建新的设置页面');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create' })));
  });

  it('keeps maintenance mode when a temporary candidate preview shares the selected file path', async () => {
    const candidate = { id: 'same-path-candidate', workspaceId: 'w', targetPath: 'D:/demo/Settings.ui', source: '<ui/>', sourceHash: 'b'.repeat(64), createdAt: 1, blueprint: { fileName: 'Settings.ui', rootType: 'QWidget' as const, rootObjectName: 'widget', windowTitle: 'Settings', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget' as const, className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] }, validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] } };
    let resolveSnapshot!: (snapshot: V3TaskSnapshot | undefined) => void;
    const snapshot = new Promise<V3TaskSnapshot | undefined>((resolve) => { resolveSnapshot = resolve; });
    const candidateApi = { ...api, ai: { getTaskSnapshot: async () => snapshot, onTaskEvent: () => () => {}, startTaskStream: async () => ({ taskId: 'workspace:w' }) } } as unknown as DesktopApi;
    const user = userEvent.setup();
    render(<V3App api={candidateApi} />);

    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    await act(async () => resolveSnapshot({ taskId: 'workspace:w', status: 'completed', lastSequence: 1, events: [{ taskId: 'workspace:w', sequence: 1, timestamp: 1, lane: 'generation', type: 'artifact', status: 'completed', title: '候选已生成', artifact: { kind: 'candidate', id: candidate.id, filePath: candidate.targetPath, candidate } }], candidate, createdAt: 1, updatedAt: 1 }));
    await user.click(screen.getByRole('tab', { name: /AI 任务/ }));

    expect(await screen.findByRole('tab', { name: /Settings\.ui.*待审批/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '关闭 Settings.ui' }));

    expect(screen.queryByRole('button', { name: /引用组件库/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '完整应用' })).toBeNull();
  });
  it('keeps an empty workspace expandable and makes activity buttons switch panels', async () => {
    const emptyApi = { ...api, workspace: { ...api.workspace, open: async () => ({ id: 'empty', name: 'Empty', rootDir: 'D:/empty', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [] }) } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={emptyApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    expect(screen.getByText(/未发现 \.ui 文件，可先创建新界面/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '搜索' }));
    expect(screen.getByLabelText('搜索项目')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Explorer' }));
    expect(screen.getByRole('button', { name: /Empty/ })).toBeTruthy();
  });
  it('uses the exact current-device Kit for a portable project profile', async () => {
    const startTaskStream = vi.fn(async () => ({ taskId: 'workspace:w' }));
    const localKit = { id: 'local-qt59', displayName: 'Qt 5.9.6 MSVC 2015', version: '5.9.6', qtMajor: 5 as const, rootDir: 'E:/Qt/5.9.6/msvc2015_64', binDirectory: 'E:/Qt/5.9.6/msvc2015_64/bin', uic: 'E:/Qt/5.9.6/msvc2015_64/bin/uic.exe', rcc: 'E:/Qt/5.9.6/msvc2015_64/bin/rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' };
    const portableWorkspaceApi = { ...api, workspace: { ...api.workspace, open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } }, files: [] }) }, settings: { ...api.settings, qtKits: { list: async () => [localKit] } }, ai: { startTaskStream, getTaskSnapshot: async () => undefined, onTaskEvent: () => () => {} } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={portableWorkspaceApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.type(screen.getByLabelText('发送给 AI'), '创建主窗口');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create', request: expect.objectContaining({ qtKitId: 'local-qt59' }) })));
  });

  it('keeps an unmatched portable workspace open and asks for a local Qt Kit', async () => {
    const unmatchedWorkspaceApi = { ...api, workspace: { ...api.workspace, open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } }, files: [] }) }, settings: { ...api.settings, qtKits: { list: async () => [{ id: 'local-qt6', displayName: 'Qt 6', version: '6.8.3', qtMajor: 6 as const, rootDir: 'E:/Qt/6.8.3/msvc2022_64', binDirectory: 'E:/Qt/6.8.3/msvc2022_64/bin', uic: 'uic.exe', rcc: 'rcc.exe', compilerAbi: 'msvc2022_64', architecture: 'x86_64' }] } } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={unmatchedWorkspaceApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    expect(await screen.findByText('需要绑定本机 Qt Kit，才能在此设备预览或构建项目。')).toBeTruthy();
    expect(screen.getByText(/未发现 \.ui 文件，可先创建新界面/)).toBeTruthy();
  });
  it('switches the left panel to task history', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);
    await user.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getByRole('heading', { name: '任务历史' })).toBeTruthy();
  });

  it('passes selected reusable components into the next UI creation task', async () => {
    const selected = { capabilityId: 'local.ui_fragment.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录模块', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [] };
    const startTaskStream = vi.fn(async () => ({ taskId: 'workspace:w' }));
    const componentApi = { ...api, capabilities: { search: vi.fn(async () => [selected]) }, ai: { startTaskStream, getTaskSnapshot: async () => undefined, onTaskEvent: () => () => {} } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={componentApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.click(screen.getByRole('button', { name: '组件库' }));
    await user.click(await screen.findByRole('button', { name: /登录表单卡片/ }));
    await user.click(screen.getByRole('button', { name: '加入当前任务' }));
    await user.click(screen.getByRole('tab', { name: /AI 任务/ }));
    expect(screen.getByRole('button', { name: /引用组件库/ }).textContent).toContain('组件库 · 1');
    await user.type(screen.getByLabelText('发送给 AI'), '创建登录应用');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create', request: expect.objectContaining({ capabilityCandidates: [selected] }) })));
  });

  it('keeps selected components but excludes them when library use is disabled', async () => {
    const selected = { capabilityId: 'local.ui_fragment.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录模块', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [] };
    const startTaskStream = vi.fn(async () => ({ taskId: 'workspace:w' }));
    const componentApi = { ...api, capabilities: { search: vi.fn(async () => [selected]) }, ai: { startTaskStream, getTaskSnapshot: async () => undefined, onTaskEvent: () => () => {} } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={componentApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.click(screen.getByRole('button', { name: '组件库' }));
    await user.click(await screen.findByRole('button', { name: /登录表单卡片/ }));
    await user.click(screen.getByRole('button', { name: '加入当前任务' }));
    await user.click(screen.getByRole('tab', { name: /AI 任务/ }));
    await user.click(screen.getByRole('button', { name: /引用组件库/ }));
    await user.type(screen.getByLabelText('发送给 AI'), '创建不引用组件库的页面');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create', request: expect.objectContaining({ useComponentLibrary: false, capabilityCandidates: [] }) })));
    await user.click(screen.getByRole('button', { name: '组件库' }));
    expect(screen.getByRole('button', { name: /登录表单卡片/ }).closest('.v3-capability-card')?.getAttribute('data-selected')).toBe('true');
  });

  it('opens settings as the active activity without an unrelated contextual sidebar', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);

    await user.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getByRole('complementary', { name: '任务历史' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.getByRole('tab', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '设置' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('complementary', { name: '任务历史' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: '项目文件' })).toBeNull();
    expect(document.querySelector('.v3-workspace-shell')?.classList.contains('has-no-sidebar')).toBe(true);
    expect(screen.getByRole('main', { name: '设置' })).toBeTruthy();
  });

  it('auto-opens a candidate only once and then allows switching back to the AI task', async () => {
    const candidate = { id: 'candidate-once', workspaceId: 'w', targetPath: 'D:/demo/ui/NewWidget.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1, blueprint: { fileName: 'NewWidget.ui', rootType: 'QWidget' as const, rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget' as const, className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] }, validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] } };
    const candidateApi = { ...api, ai: { getTaskSnapshot: async (taskId: string) => ({ taskId, status: 'completed' as const, lastSequence: 1, events: [{ taskId, sequence: 1, timestamp: 1, lane: 'generation' as const, type: 'artifact' as const, status: 'completed' as const, title: '候选已生成', artifact: { kind: 'candidate' as const, id: candidate.id, filePath: candidate.targetPath, candidate } }], candidate, createdAt: 1, updatedAt: 1 }), onTaskEvent: () => () => {}, startTaskStream: async () => ({ taskId: 'workspace:w' }) } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={candidateApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    expect(await screen.findByRole('tab', { name: /NewWidget\.ui/ })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /AI 任务/ }));
    expect(await screen.findByRole('main', { name: 'AI 工作区' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /AI 任务/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('automatically resumes the workspace task after a Qt Kit binding is saved', async () => {
    const resumeTaskStream = vi.fn(async () => ({ resumed: true }));
    const resumeApi = { ...api, ai: { resumeTaskStream, onTaskEvent: () => () => {}, getTaskSnapshot: async () => undefined, startTaskStream: async () => ({ taskId: 'workspace:w' }) } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={resumeApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    window.dispatchEvent(new CustomEvent('v3:project-binding-saved', { detail: { workspaceId: 'w' } }));
    await waitFor(() => expect(resumeTaskStream).toHaveBeenCalledWith('workspace:w'));
    expect(await screen.findByText('Qt Kit 已绑定，正在自动继续上次任务')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /AI 任务/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('previews through the bound Kit even though a saved Kit never records cmake', async () => {
    // Reproduced from the reported failure: the project had a matching, explicitly
    // bound Kit, yet preview claimed the project was unconfigured, because the
    // renderer demanded a `cmake` path that a saved Kit does not store.
    const renderPreview = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 0.9 }));
    const boundKit = { id: 'qt-6.10.2', displayName: 'Qt 6.10.2 MSVC 2022', version: '6.10.2', qtMajor: 6 as const, rootDir: 'E:/Qt/6.10.2/msvc2022_64', binDirectory: 'E:/Qt/6.10.2/msvc2022_64/bin', uic: 'E:/Qt/6.10.2/msvc2022_64/bin/uic.exe', rcc: 'E:/Qt/6.10.2/msvc2022_64/bin/rcc.exe', compilerAbi: 'msvc2022_64', architecture: 'x86_64' };
    const kitApi = {
      ...api,
      preview: { render: renderPreview },
      settings: { ...api.settings, qtKits: { list: async () => [boundKit] }, getProjectBinding: async () => ({ projectId: 'project-1', qtKitId: 'qt-6.10.2', config: {} }) },
      workspace: { ...api.workspace, open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 1, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { id: 'project-1', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } }, files: [{ absolutePath: 'D:/demo/Settings.ui', relativePath: 'ui/Settings.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'x' }] }) },
    } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={kitApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    await user.click(screen.getByRole('button', { name: '生成预览' }));
    await waitFor(() => expect(renderPreview).toHaveBeenCalledWith(expect.objectContaining({ uiFile: 'D:/demo/Settings.ui', qt: expect.objectContaining({ version: '6.10.2', binDirectory: 'E:/Qt/6.10.2/msvc2022_64/bin', cmake: 'cmake', cmakePrefixPath: 'E:/Qt/6.10.2/msvc2022_64' }) })));
    expect(screen.queryByText('当前项目尚未配置可用的 Qt Kit。')).toBeNull();
  });

  it('falls back to the Kit the project is bound to when no installed Kit matches', async () => {
    const renderPreview = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 0.9 }));
    const localKit = { id: 'local-qt59', displayName: 'Qt 5.9.6 MSVC 2015', version: '5.9.6', qtMajor: 5 as const, rootDir: 'E:/Qt/5.9.6/msvc2015_64', binDirectory: 'E:/Qt/5.9.6/msvc2015_64/bin', uic: 'E:/Qt/5.9.6/msvc2015_64/bin/uic.exe', rcc: 'E:/Qt/5.9.6/msvc2015_64/bin/rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' };
    const boundApi = {
      ...api,
      preview: { render: renderPreview },
      settings: { ...api.settings, qtKits: { list: async () => [localKit] }, getProjectBinding: async () => ({ projectId: 'project-1', qtKitId: 'local-qt59', config: {} }) },
      workspace: { ...api.workspace, open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 1, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { id: 'project-1', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } }, files: [{ absolutePath: 'D:/demo/Settings.ui', relativePath: 'ui/Settings.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'x' }] }) },
    } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={boundApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    await user.click(screen.getByRole('button', { name: '生成预览' }));
    await waitFor(() => expect(renderPreview).toHaveBeenCalledWith(expect.objectContaining({ qt: expect.objectContaining({ version: '5.9.6', binDirectory: 'E:/Qt/5.9.6/msvc2015_64/bin' }), profile: expect.objectContaining({ qtKitId: 'local-qt59' }) })));
  });
});
