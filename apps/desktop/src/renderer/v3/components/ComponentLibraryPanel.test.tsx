// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import { ComponentLibraryPanel } from './ComponentLibraryPanel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ComponentLibraryPanel', () => {
  afterEach(cleanup);
  it('loads bundled fragments and toggles a selected module', async () => {
    const candidate = { capabilityId: 'local.ui_fragment.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [] };
    const search = vi.fn(async () => [candidate]); const toggle = vi.fn();
    const api = { capabilities: { search } } as unknown as DesktopApi;
    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={toggle} onClear={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: /登录表单卡片/ });
    await userEvent.setup().click(trigger);
    const card = trigger.closest('.v3-capability-card');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('该组件未提供可预览内容')).toBeTruthy();
    expect(card?.querySelector('.v3-component-detail')).toBeTruthy();
    await userEvent.setup().click(within(card as HTMLElement).getByRole('button', { name: '加入当前任务' }));
    expect(toggle).toHaveBeenCalledWith(candidate);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ui_fragment', kit: expect.objectContaining({ version: '5.9.6' }) }));
  });

  it('moves inline details to the newly focused candidate', async () => {
    const first = { capabilityId: 'local.ui_fragment.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [] };
    const second = { ...first, capabilityId: 'local.ui_fragment.table-panel', displayName: '数据表格面板', description: '表格' };
    const api = { capabilities: { search: vi.fn(async () => [first, second]) } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    const firstTrigger = await screen.findByRole('button', { name: /登录表单卡片/ });
    const secondTrigger = screen.getByRole('button', { name: /数据表格面板/ });
    const firstCard = firstTrigger.closest('.v3-capability-card');
    const secondCard = secondTrigger.closest('.v3-capability-card');

    await user.click(firstTrigger);
    expect(firstCard?.querySelector('.v3-component-detail')).toBeTruthy();
    expect(secondCard?.querySelector('.v3-component-detail')).toBeNull();

    await user.click(secondTrigger);
    expect(firstCard?.querySelector('.v3-component-detail')).toBeNull();
    expect(secondCard?.querySelector('.v3-component-detail')).toBeTruthy();
  });

  it('automatically previews on selection and only enlarges after an explicit screenshot click', async () => {
    const candidate = { capabilityId: 'source.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'login-card', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const preview = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const openWindow = vi.fn(async () => undefined);
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [candidate]), preview }, preview: { render: vi.fn(), cancel: vi.fn(), openWindow } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /登录表单卡片/ }));
    const details = screen.getByRole('complementary', { name: '登录表单卡片 组件详情' });
    expect(within(details).queryByText('登录表单卡片')).toBeNull();

    await waitFor(() => expect(preview).toHaveBeenCalledWith({ sourceId: 'source', componentId: 'login-card' }));
    expect(openWindow).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: '打开登录表单卡片预览大图' }));
    expect(openWindow).toHaveBeenCalledWith('data:image/png;base64,AA==', '登录表单卡片');
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '重新生成预览' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale preview result after focus and loading move to another candidate', async () => {
    const first = { capabilityId: 'source.first', displayName: '组件 A', kind: 'ui_fragment' as const, description: '第一个组件', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'first', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const second = { ...first, capabilityId: 'source.second', displayName: '组件 B', description: '第二个组件', componentId: 'second' };
    const firstRequest = deferred<{ imageDataUrl: string; mode: 'enhanced'; imagePath: string; width: number; height: number; findings: never[]; degradedFeatures: never[]; confidence: number }>();
    const secondRequest = deferred<{ imageDataUrl: string; mode: 'enhanced'; imagePath: string; width: number; height: number; findings: never[]; degradedFeatures: never[]; confidence: number }>();
    const preview = vi.fn((input: { componentId: string }) => input.componentId === 'first' ? firstRequest.promise : secondRequest.promise);
    const openWindow = vi.fn(async () => undefined);
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [first, second]), preview }, preview: { render: vi.fn(), cancel: vi.fn(), openWindow } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /组件 A/ }));
    expect(screen.getByRole('status').textContent).toContain('正在生成预览');

    await user.click(screen.getByRole('button', { name: /组件 B/ }));
    firstRequest.resolve({ imageDataUrl: 'data:image/png;base64,FIRST', mode: 'enhanced', imagePath: 'first.png', width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 });

    await waitFor(() => expect(openWindow).not.toHaveBeenCalledWith('data:image/png;base64,FIRST', '组件 A'));
    expect(screen.queryByAltText('组件 A 预览')).toBeNull();
    expect(screen.queryByAltText('组件 B 预览')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('正在生成预览');

    secondRequest.resolve({ imageDataUrl: 'data:image/png;base64,SECOND', mode: 'enhanced', imagePath: 'second.png', width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 });
    expect((await screen.findByAltText('组件 B 预览')).getAttribute('src')).toBe('data:image/png;base64,SECOND');
    await waitFor(() => expect(screen.getByRole('button', { name: '重新生成预览' }).hasAttribute('disabled')).toBe(false));
  });

  it('ignores a stale preview error after switching candidates', async () => {
    const first = { capabilityId: 'source.first', displayName: '组件 A', kind: 'ui_fragment' as const, description: '第一个组件', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'first', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const second = { ...first, capabilityId: 'source.second', displayName: '组件 B', description: '第二个组件', componentId: 'second' };
    const firstRequest = deferred<never>();
    const secondRequest = deferred<never>();
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [first, second]), preview: vi.fn((input: { componentId: string }) => input.componentId === 'first' ? firstRequest.promise : secondRequest.promise) } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /组件 A/ }));
    await user.click(screen.getByRole('button', { name: /组件 B/ }));
    firstRequest.reject(new Error('A 预览失败'));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('正在生成预览');
  });

  it('keeps search errors at list level and clears them after a successful search', async () => {
    const candidate = { capabilityId: 'source.login-card', displayName: '登录表单卡片', kind: 'ui_fragment' as const, description: '登录', tags: ['登录'], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'login-card', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const search = vi.fn(async (input: { text: string }) => {
      if (input.text === 'fail') throw new Error('组件搜索失败');
      return [candidate];
    });
    const api = { componentSources: { list: vi.fn(async () => []), search, preview: vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 1 })) } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: /登录表单卡片 界面模块/ });
    await user.click(trigger);
    const card = trigger.closest('.v3-capability-card');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索组件' }), { target: { value: 'fail' } });

    const searchAlert = await screen.findByRole('alert');
    expect(searchAlert.textContent).toBe('组件搜索失败');
    expect(card?.contains(searchAlert)).toBe(false);

    fireEvent.change(screen.getByRole('textbox', { name: '搜索组件' }), { target: { value: 'ok' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('explains when a source component explicitly disables preview', async () => {
    const candidate = { capabilityId: 'source.no-preview', displayName: '无预览组件', kind: 'ui_fragment' as const, description: '只能加入任务', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'no-preview', sourceName: '本地组件库', previewAvailable: false, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const preview = vi.fn();
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [candidate]), preview } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /无预览组件/ }));
    const details = screen.getByRole('complementary', { name: '无预览组件 组件详情' });

    expect(within(details).getByText('该组件未提供可预览内容')).toBeTruthy();
    expect(within(details).queryByRole('button', { name: '生成组件预览' })).toBeNull();
    expect(within(details).getByRole('button', { name: '加入当前任务' })).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
  });

  it('marks an unmapped Qt binary widget as requiring mapping and prevents adding it', async () => {
    const candidate = { capabilityId: 'source.binary.fancy', displayName: 'FancyWidget', kind: 'promoted_widget' as const, description: '第三方动态控件', tags: ['qt_binary', 'QWidget'], dependencyStatus: 'blocked' as const, reasons: ['该动态组件尚未完成映射配置，不能加入任务'], sourceId: 'binary', componentId: 'FancyWidget', sourceName: '企业动态控件', previewAvailable: false, licenseName: '用户提供', inferred: true, updatedAt: 1 };
    const toggle = vi.fn();
    const api = { componentSources: { list: vi.fn(async () => [{ id: 'binary', name: '企业动态控件', kind: 'qt_binary', enabled: true, protected: false, config: {}, health: { status: 'ready' }, itemCount: 1, hasCredential: false, createdAt: 1, updatedAt: 1 }]), search: vi.fn(async () => [candidate]), preview: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup();
    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={toggle} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /FancyWidget/ }));
    expect(screen.getAllByText('需配置映射').length).toBeGreaterThan(0);
    const action = screen.getByRole('button', { name: '需配置映射后才能加入' });
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('reuses successful previews when revisiting a component', async () => {
    const first = { capabilityId: 'source.first', displayName: '组件 A', kind: 'ui_fragment' as const, description: '第一个组件', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'first', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const second = { ...first, capabilityId: 'source.second', displayName: '组件 B', componentId: 'second' };
    const preview = vi.fn(async (input: { componentId: string }) => ({ imageDataUrl: `data:image/png;base64,${input.componentId}`, mode: 'enhanced' as const, imagePath: `${input.componentId}.png`, width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [first, second]), preview } } as unknown as DesktopApi;
    const user = userEvent.setup();

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /组件 A/ }));
    expect((await screen.findByAltText('组件 A 预览')).getAttribute('src')).toContain('first');
    await user.click(screen.getByRole('button', { name: /组件 B/ }));
    expect((await screen.findByAltText('组件 B 预览')).getAttribute('src')).toContain('second');
    await user.click(screen.getByRole('button', { name: /组件 A/ }));
    expect((await screen.findByAltText('组件 A 预览')).getAttribute('src')).toContain('first');
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it('invalidates cached previews when the Qt profile changes', async () => {
    const candidate = { capabilityId: 'source.card', displayName: '组件卡片', kind: 'ui_fragment' as const, description: '卡片', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'card', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const preview = vi.fn(async () => ({ imageDataUrl: `data:image/png;base64,${preview.mock.calls.length}`, mode: 'enhanced' as const, imagePath: 'card.png', width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [candidate]), preview } } as unknown as DesktopApi;
    const workspace = (version: string) => ({ id: 'workspace', name: 'demo', rootDir: 'D:/demo', files: [], profile: { qt: { id: `qt-${version}`, version } } });
    const user = userEvent.setup();
    const view = render(<ComponentLibraryPanel api={api} workspace={workspace('5.9.6') as never} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /组件卡片/ }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    view.rerender(<ComponentLibraryPanel api={api} workspace={workspace('6.8.0') as never} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} />);
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
  });

  it('turns a raw missing-kit IPC error into an actionable settings prompt', async () => {
    const candidate = { capabilityId: 'source.card', displayName: '组件卡片', kind: 'ui_fragment' as const, description: '卡片', tags: [], dependencyStatus: 'ready' as const, reasons: [], sourceId: 'source', componentId: 'card', sourceName: '本地组件库', previewAvailable: true, licenseName: 'MIT', inferred: false, updatedAt: 1 };
    const preview = vi.fn(async () => { throw new Error("Error invoking remote method 'v3.componentSources.preview': Error: 请先在设置中绑定 Qt Kit，再预览组件"); });
    const openSettings = vi.fn();
    const api = { componentSources: { list: vi.fn(async () => []), search: vi.fn(async () => [candidate]), preview } } as unknown as DesktopApi;

    render(<ComponentLibraryPanel api={api} selected={[]} onToggle={vi.fn()} onClear={vi.fn()} onOpenSettings={openSettings} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /组件卡片/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('需要配置 Qt Kit');
    expect(screen.queryByText(/Error invoking remote method/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '打开设置' }));
    expect(openSettings).toHaveBeenCalledOnce();
  });
});
