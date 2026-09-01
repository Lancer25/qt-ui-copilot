// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesktopApi, WorkspaceSummary } from '../../lib/api';
import { SettingsDetailPanel } from './SettingsDetailPanel';

const workspace: WorkspaceSummary = { id: 'demo', name: 'Demo', rootDir: 'D:/demo', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [] };
const api = { workspace: { readText: async () => JSON.stringify({ preview: { sourceDirectory: 'host', cacheDirectory: 'cache', width: 900, height: 640, style: 'Fusion', locale: 'zh_CN', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [] } }), writeText: async () => undefined } } as unknown as DesktopApi;

describe('SettingsDetailPanel', () => {
  afterEach(cleanup);

  it('groups preview settings by purpose and keeps the project save action visible', async () => {
    render(<SettingsDetailPanel api={api} section="preview" workspace={workspace} />);
    expect(await screen.findByRole('group', { name: '预览尺寸与样式' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'PreviewHost 与缓存' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '资源加载' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存项目配置' })).toBeTruthy();
  });
});
