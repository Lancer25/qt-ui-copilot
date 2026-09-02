// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
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
  it('switches the left panel to task history', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);
    await user.click(screen.getByRole('button', { name: '任务' }));
    expect(screen.getByRole('heading', { name: '任务历史' })).toBeTruthy();
  });

  it('opens settings in one central tab and preserves the project sidebar', async () => {
    const user = userEvent.setup(); render(<V3App api={api} />);

    await user.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.getByRole('tab', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '项目文件' })).toBeTruthy();
    expect(screen.getByRole('main', { name: '设置' })).toBeTruthy();
  });
});
