// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { V3App } from './V3App';
import type { DesktopApi } from '../lib/api';

const api = { workspace: { open: async () => ({ id: 'w', name: 'Demo', rootDir: 'D:/demo', fileCount: 1, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { qt: { version: '6.10.2' }, preview: {} }, files: [{ absolutePath: 'D:/demo/Settings.ui', relativePath: 'ui/Settings.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'x' }] }), listFiles: async () => [], onChange: () => () => {} }, projects: { chooseDirectory: async () => 'D:/demo' }, preview: { render: async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: 'preview.png', findings: [], degradedFeatures: [], confidence: 0.9 }) }, } as unknown as DesktopApi;
afterEach(cleanup);
describe('V3App', () => {
  it('opens a workspace and a ui file with quick/enhanced preview tabs', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
    expect(screen.getByRole('tab', { name: 'Settings.ui' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '增强预览' }));
    expect(screen.getByRole('img', { name: '增强 Qt 预览' })).toBeTruthy();
  });
  it('keeps an empty workspace expandable and makes activity buttons switch panels', async () => {
    const emptyApi = { ...api, workspace: { ...api.workspace, open: async () => ({ id: 'empty', name: 'Empty', rootDir: 'D:/empty', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [] }) } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<V3App api={emptyApi} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹' }));
    expect(screen.getByText('文件夹为空，未发现 .ui 文件')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '搜索' }));
    expect(screen.getByLabelText('搜索项目')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Explorer' }));
    expect(screen.getByRole('button', { name: /Empty/ })).toBeTruthy();
  });
});
