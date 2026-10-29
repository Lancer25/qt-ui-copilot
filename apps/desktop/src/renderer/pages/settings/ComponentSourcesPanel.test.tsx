// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import type { ComponentSourceInput } from '@qt-ui-copilot/contracts';
import { ComponentSourcesPanel } from './ComponentSourcesPanel';

describe('ComponentSourcesPanel', () => {
  afterEach(cleanup);
  it('adds and synchronizes a hybrid local component source', async () => {
    const bundled = { id: 'bundled', name: '内置组件库', kind: 'bundled' as const, enabled: true, protected: true, config: {}, health: { status: 'ready' as const }, itemCount: 9, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const saved = { ...bundled, id: 'local', name: '企业组件库', kind: 'local' as const, protected: false, config: { rootDir: 'D:/components', discovery: 'hybrid' as const }, itemCount: 0 };
    const list = vi.fn(async () => [bundled]); const save = vi.fn(async () => saved); const sync = vi.fn(async () => ({ ...saved, itemCount: 12 }));
    const api = { componentSources: { list, save, sync, test: vi.fn(), remove: vi.fn(), search: vi.fn(), preview: vi.fn() }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<ComponentSourcesPanel api={api} />);
    expect(await screen.findByText('内置组件库')).toBeTruthy();
    expect(screen.getByRole('option', { name: '本地控件库（自动识别）' })).toBeTruthy();
    await user.type(screen.getByPlaceholderText('例如 企业组件库'), '企业组件库');
    await user.type(screen.getByPlaceholderText('D:/QtComponents'), 'D:/components');
    await user.click(screen.getByRole('button', { name: '添加并同步' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ name: '企业组件库', kind: 'local', enabled: true, config: { rootDir: 'D:/components', discovery: 'hybrid' } }));
    expect(sync).toHaveBeenCalledWith('local');
  });

  it('renders protected ready sources with a compact status and no mutating controls', async () => {
    const protectedSource = { id: 'gtronick-qss', name: 'GTRONICK/QSS 基础控件', kind: 'bundled' as const, enabled: true, protected: true, config: {}, health: { status: 'ready' as const, message: '已加载 7 个组件' }, itemCount: 7, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const api = { componentSources: { list: vi.fn(async () => [protectedSource]), save: vi.fn(), sync: vi.fn(), test: vi.fn(), remove: vi.fn(), search: vi.fn(), preview: vi.fn() }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    render(<ComponentSourcesPanel api={api} />);
    const card = (await screen.findByText('GTRONICK/QSS 基础控件')).closest('.component-source-card');
    expect(card?.querySelector('.component-source-status')?.textContent).toBe('可用');
    expect(card?.querySelector('.component-source-status')?.classList.contains('is-ready')).toBe(true);
    expect(card?.textContent).not.toContain('禁用');
    expect(card?.textContent).not.toContain('删除');
  });

  it('adds a Qt binary source with a distinct optional component-library Qt Kit', async () => {
    const saved = { id: 'binary', name: '企业动态控件', kind: 'qt_binary' as const, enabled: true, protected: false, config: { rootDir: 'D:/VendorWidgets', discovery: 'hybrid' as const, libraryQtKitId: 'qt-6' }, health: { status: 'idle' as const }, itemCount: 0, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const save = vi.fn(async () => saved);
    const api = { componentSources: { list: vi.fn(async () => []), save, sync: vi.fn(async () => saved), test: vi.fn(), remove: vi.fn(), search: vi.fn(async () => []) }, projects: { chooseDirectory: vi.fn() }, settings: { qtKits: { list: vi.fn(async () => [{ id: 'qt-6', displayName: 'Qt 6.8 MSVC' }]) } } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<ComponentSourcesPanel api={api} />);
    await user.selectOptions(screen.getByLabelText('类型'), 'qt_binary');
    await user.type(screen.getByPlaceholderText('例如 企业组件库'), '企业动态控件');
    await user.type(screen.getByPlaceholderText('D:/VendorWidgets'), 'D:/VendorWidgets');
    await user.type(screen.getByPlaceholderText('选择组件库编译时使用的 Qt Kit'), 'qt-6');
    await user.click(screen.getByRole('button', { name: '添加并同步' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ name: '企业动态控件', kind: 'qt_binary', enabled: true, config: { rootDir: 'D:/VendorWidgets', discovery: 'hybrid', libraryQtKitId: 'qt-6' } }));
    expect(screen.getByText('项目 Qt Kit 在“项目绑定”中设置；源码和 header-only 控件会直接使用项目 Qt 编译。')).toBeTruthy();
  });

  it('shows discovered binary components and saves an approved mapping', async () => {
    const source = { id: 'binary', name: '企业动态控件', kind: 'qt_binary' as const, enabled: true, protected: false, config: { rootDir: 'D:/VendorWidgets', discovery: 'hybrid' as const }, health: { status: 'ready' as const }, itemCount: 1, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const candidate = { capabilityId: 'source.binary.widget', sourceId: 'binary', componentId: 'FancyWidget', sourceName: '企业动态控件', displayName: 'FancyWidget', kind: 'promoted_widget' as const, description: '动态控件', tags: ['qt_binary'], dependencyStatus: 'blocked' as const, reasons: ['该动态组件尚未完成映射配置，不能加入任务'], previewAvailable: false, licenseName: '用户提供', inferred: true, updatedAt: 1 };
    const save = vi.fn(async (input: ComponentSourceInput) => ({ ...source, config: input.config }));
    const api = { componentSources: { list: vi.fn(async () => [source]), save, sync: vi.fn(async () => source), test: vi.fn(), remove: vi.fn(), search: vi.fn(async () => [candidate]) }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<ComponentSourcesPanel api={api} />);
    expect(await screen.findByText('控件接入状态')).toBeTruthy();
    expect(await screen.findByText(/已索引 1 个控件，当前显示 1 个/)).toBeTruthy();
    await user.type(screen.getByLabelText('FancyWidget 头文件'), 'include/FancyWidget.h');
    await user.type(screen.getByLabelText('FancyWidget DLL'), 'bin/FancyWidgets.dll');
    await user.type(screen.getByLabelText('FancyWidget LIB'), 'lib/FancyWidgets.lib');
    await user.type(screen.getByLabelText('FancyWidget Qt 主版本'), '6');
    await user.type(screen.getByLabelText('FancyWidget 编译器 ABI'), 'msvc2022_64');
    await user.type(screen.getByLabelText('FancyWidget 架构'), 'x86_64');
    await user.click(screen.getByRole('checkbox', { name: '已核对 ABI 与依赖，允许加入任务' }));
    await user.click(screen.getByRole('button', { name: '保存映射' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'qt_binary', config: expect.objectContaining({ mappings: [expect.objectContaining({ componentId: 'FancyWidget', className: 'FancyWidget', headerPath: 'include/FancyWidget.h', dllPath: 'bin/FancyWidgets.dll', libPath: 'lib/FancyWidgets.lib', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64', approved: true })] }) })));
  });

  it('keeps a complete binary control index while loading mapping rows by page', async () => {
    const source = { id: 'binary', name: '大型动态控件库', kind: 'qt_binary' as const, enabled: true, protected: false, config: { rootDir: 'D:/VendorWidgets', discovery: 'hybrid' as const }, health: { status: 'ready' as const }, itemCount: 26, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const candidates = Array.from({ length: 26 }, (_, index) => ({ capabilityId: `source.binary.button-${index + 1}`, sourceId: 'binary', componentId: `button-${index + 1}`, sourceName: '大型动态控件库', displayName: `Button${index + 1}`, kind: 'promoted_widget' as const, description: '动态控件', tags: ['qt_binary'], dependencyStatus: 'blocked' as const, reasons: ['待配置'], previewAvailable: false, licenseName: '用户提供', inferred: true, updatedAt: 1 }));
    const search = vi.fn(async (input: { offset?: number }) => candidates.slice(input.offset ?? 0, (input.offset ?? 0) + 25));
    const api = { componentSources: { list: vi.fn(async () => [source]), save: vi.fn(async () => source), sync: vi.fn(async () => source), test: vi.fn(), remove: vi.fn(), search, preview: vi.fn() }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<ComponentSourcesPanel api={api} />);

    expect(await screen.findByText('已索引 26 个控件，当前显示 25 个 · 已自动接入 0 · 需配置 26')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '加载更多控件' }));
    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ offset: 25, limit: 25 })));
    expect(await screen.findByText('已索引 26 个控件，当前显示 26 个 · 已自动接入 0 · 需配置 26')).toBeTruthy();
  });

  it('opens component sources created before sourcePaths was introduced', async () => {
    const legacyMapping = { componentId: 'legacy-button', className: 'LegacyButton', baseClass: 'QWidget' as const, headerPath: 'LegacyButton.h', qtModules: ['Widgets'], runtimeDllPaths: [], designerPlugin: false, previewProperties: {}, origin: 'automatic' as const, confidence: 'medium' as const, inference: [], approved: false };
    const source = { id: 'legacy', name: '旧版控件库', kind: 'qt_binary' as const, enabled: true, protected: false, config: { rootDir: 'D:/Legacy', discovery: 'scan' as const, mappings: [legacyMapping] }, health: { status: 'ready' as const }, itemCount: 1, hasCredential: false, createdAt: 1, updatedAt: 1 };
    const api = { componentSources: { list: vi.fn(async () => [source]), save: vi.fn(), sync: vi.fn(), test: vi.fn(), remove: vi.fn(), search: vi.fn(async () => []) }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;

    render(<ComponentSourcesPanel api={api} />);

    expect(await screen.findByText('旧版控件库')).toBeTruthy();
    expect(screen.getByText(/Qt 源码控件库|Qt 动态库/)).toBeTruthy();
  });
});
