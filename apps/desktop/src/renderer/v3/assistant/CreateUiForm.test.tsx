// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateUiForm } from './CreateUiForm';
import type { DesktopApi, UiCreationResult, WorkspaceSummary } from '../../lib/api';

const workspace: WorkspaceSummary = { id: 'w', rootDir: 'D:/demo', name: 'demo', fileCount: 0, files: [], lastOpenedAt: 1, createdAt: 1, updatedAt: 1, profile: { qt: { version: '5.9.6' }, preview: { sourceDirectory: 'D:/preview', cacheDirectory: 'D:/cache' } } };
const candidate: UiCreationResult = { id: 'candidate-1', workspaceId: 'w', targetPath: 'D:/demo/ui/NewWidget.ui', source: '<ui version="4.0"/>', sourceHash: 'a'.repeat(64), blueprint: { fileName: 'NewWidget.ui', rootType: 'QWidget', rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget', className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['renders'] }, validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] }, createdAt: 1, previewDataUrl: 'data:image/png;base64,AA==' };

describe('CreateUiForm', () => {
  it('generates a candidate and commits it for a permanent tab', async () => {
    const user = userEvent.setup(); const onCommitted = vi.fn();
    const api = { ai: { createUiCandidate: vi.fn(async () => candidate), commitUiCandidate: vi.fn(async () => ({ uiFile: candidate.targetPath })), rejectUiCandidate: vi.fn(async () => undefined) } } as unknown as DesktopApi;
    render(<CreateUiForm api={api} workspace={workspace} attachments={[]} onCommitted={onCommitted} />);
    await user.type(screen.getByLabelText('新界面需求'), 'Create a settings panel');
    await user.click(screen.getByRole('button', { name: '生成界面草稿' }));
    expect(await screen.findByRole('img', { name: '新界面草稿预览' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '审批并保存' }));
    expect(onCommitted).toHaveBeenCalledWith(candidate.targetPath);
  });
});
