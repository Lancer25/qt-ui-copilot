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
});
