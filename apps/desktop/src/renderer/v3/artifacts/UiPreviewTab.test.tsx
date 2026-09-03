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

  it('opens a 100% preview in a dedicated window', async () => {
    const user = userEvent.setup(); const openWindow = vi.fn(async () => undefined);
    const api = { preview: { render: vi.fn(), openWindow } } as unknown as DesktopApi;
    render(<UiPreviewTab api={api} filePath="D:/demo/Main.ui" candidate={{ id: 'candidate-1', workspaceId: 'w', targetPath: 'D:/demo/Main.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1, previewDataUrl: 'data:image/png;base64,AA==', blueprint: { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget', className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] }, validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] } }} />);
    await user.click(screen.getByRole('button', { name: /100%/ }));
    expect(openWindow).toHaveBeenCalledWith('data:image/png;base64,AA==', 'Main.ui');
  });
});
