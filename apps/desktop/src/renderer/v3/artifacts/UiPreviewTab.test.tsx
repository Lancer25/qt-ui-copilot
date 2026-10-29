// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiPreviewTab } from './UiPreviewTab';
import type { DesktopApi, V3PreviewRequest } from '../../lib/api';

const request = (mode: 'quick' | 'enhanced'): V3PreviewRequest => ({ uiFile: 'D:/demo/Main.ui', profile: { qtKitId: 'qt6', mode, width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [], highDpiMode: 'project-default' }, qt: { version: '6.0', compilerAbi: 'x64', architecture: 'x64', binDirectory: 'bin', uic: 'uic', rcc: 'rcc', cmake: 'cmake', cmakePrefixPath: 'prefix' }, sourceDirectory: 'D:/demo', cacheDirectory: 'D:/cache', outputImage: 'D:/out.png' });

describe('UiPreviewTab', () => {
  afterEach(cleanup);
  it('uses a full preview surface and still allows saving a uic-valid candidate after a preview failure', async () => {
    const user = userEvent.setup(); const commit = vi.fn(); const renderPreview = vi.fn(async () => { throw new Error('PreviewHost unavailable'); });
    const api = { preview: { render: renderPreview } } as unknown as DesktopApi;
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" candidate={{ id: 'candidate-1', workspaceId: 'w', targetPath: 'D:/demo/Main.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1, blueprint: { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget', className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] }, validation: { xml: true, semantic: true, uic: true, preview: false, findings: [] } }} buildPreviewRequest={request} onCommit={commit} />);
    await user.click(screen.getByRole('button', { name: '刷新预览' }));
    expect((await screen.findByRole('alert')).textContent).toContain('PreviewHost unavailable');
    expect((screen.getByRole('button', { name: '保存基础版本' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存基础版本' }));
    expect(commit).toHaveBeenCalledWith('candidate-1');
    expect(screen.getByLabelText('Qt 预览画布')).toBeTruthy();
  });

  it('keeps the saved preview available without approval controls', async () => {
    const user = userEvent.setup(); const openWindow = vi.fn(async () => undefined);
    const api = { preview: { render: vi.fn(), openWindow } } as unknown as DesktopApi;
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" candidate={{ id: 'candidate-1', workspaceId: 'w', targetPath: 'D:/demo/Main.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1, saved: true, previewDataUrl: 'data:image/png;base64,AA==', blueprint: { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget', className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] }, validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] } }} />);
    await user.click(screen.getByRole('button', { name: '在独立窗口打开' }));
    expect(screen.queryByLabelText('草稿审批')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('本轮已完成');
    expect(openWindow).toHaveBeenCalledWith('data:image/png;base64,AA==', 'Main.ui');
  });

  it('restores a cached preview after the tab is mounted again', async () => {
    const rendered = { imageDataUrl: 'data:image/png;base64,CACHED', mode: 'quick' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 1 };
    const renderPreview = vi.fn(async () => rendered); let cached: typeof rendered | undefined;
    const api = { preview: { render: renderPreview } } as unknown as DesktopApi;
    const first = render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" buildPreviewRequest={request} onPreviewResult={(result) => { cached = result as typeof rendered; }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '生成预览' }));
    expect(await screen.findByRole('img')).toBeTruthy();
    first.unmount();
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" buildPreviewRequest={request} initialResult={cached} />);
    expect(screen.getByRole('img').getAttribute('src')).toBe(rendered.imageDataUrl);
    expect(renderPreview).toHaveBeenCalledOnce();
  });

  it('switches between fit and actual display without rerendering', async () => {
    const renderPreview = vi.fn(); const user = userEvent.setup();
    const api = { preview: { render: renderPreview } } as unknown as DesktopApi;
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" initialResult={{ imageDataUrl: 'data:image/png;base64,VIEW', mode: 'quick', imagePath: 'preview.png', width: 420, height: 220, findings: [], degradedFeatures: [], confidence: 1 }} />);
    const canvas = screen.getByLabelText('Qt 预览画布');
    expect(canvas.classList.contains('is-fit')).toBe(true);
    await user.click(screen.getByRole('button', { name: '原始大小' }));
    expect(canvas.classList.contains('is-actual')).toBe(true);
    expect((screen.getByRole('img') as HTMLImageElement).style.width).toBe('420px');
    expect((screen.getByRole('img') as HTMLImageElement).style.height).toBe('220px');
    expect(screen.queryByRole('button', { name: '放大 150%' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '自适应' }));
    expect(canvas.classList.contains('is-fit')).toBe(true);
    expect(renderPreview).not.toHaveBeenCalled();
  });

  it('uses the concise adjustment action copy', async () => {
    const onAdjust = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const api = { preview: { render: vi.fn() } } as unknown as DesktopApi;
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" initialResult={{ imageDataUrl: 'data:image/png;base64,VIEW', mode: 'quick', imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 1 }} onAdjust={onAdjust} />);

    await user.type(screen.getByRole('textbox', { name: '描述预览调整' }), '按钮改成蓝色');
    await user.click(screen.getByRole('button', { name: /^调整$/ }));
    expect(onAdjust).toHaveBeenCalledWith('按钮改成蓝色', 'data:image/png;base64,VIEW');
  });
});
