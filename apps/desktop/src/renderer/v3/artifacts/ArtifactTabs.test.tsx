// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactTabs } from './ArtifactTabs';
import type { ArtifactTab } from '../state/artifact-tabs';

const tabs: ArtifactTab[] = [
  { id: 'task:default', kind: 'task', taskId: 'default', title: 'AI 任务' },
  { id: 'preview:d:/demo/main.ui', kind: 'preview', filePath: 'D:/demo/Main.ui', title: 'Main.ui', temporary: true, candidateId: 'candidate-1' },
  { id: 'source:d:/demo/main.ui', kind: 'source', filePath: 'D:/demo/Main.ui', title: 'Main.ui 源码' },
];

describe('ArtifactTabs', () => {
  it('marks temporary previews, activates a tab, and closes back to the latest tab', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn(); const onClose = vi.fn();
    render(<ArtifactTabs tabs={tabs} activeTabId={tabs[1]!.id} onActivate={onActivate} onClose={onClose} renderTab={(tab) => <p>{tab.title} 内容</p>} />);
    expect(screen.getByRole('tab', { name: /Main.ui.*待审批/ })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Main.ui 源码' }));
    expect(onActivate).toHaveBeenCalledWith('source:d:/demo/main.ui');
    await user.click(screen.getByRole('button', { name: '关闭 Main.ui' }));
    expect(onClose).toHaveBeenCalledWith('preview:d:/demo/main.ui');
  });
});
