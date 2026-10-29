// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskHistoryPanel } from './TaskHistoryPanel';
import type { DesktopApi } from '../../lib/api';

describe('TaskHistoryPanel', () => {
  it('offers a clear next action when history is empty', async () => {
    const onStart = vi.fn();
    const api = { ai: { listTaskSnapshots: vi.fn(async () => []) } } as unknown as DesktopApi;
    render(<TaskHistoryPanel api={api} onOpenTask={vi.fn()} onStartNewTask={onStart} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '开始新任务' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('lists recent tasks by update time and opens the selected task', async () => {
    const onOpen = vi.fn();
    const api = { ai: { listTaskSnapshots: vi.fn(async () => [
      { taskId: 'older', workspaceId: 'demo', title: '旧任务', targetPath: 'ui/Old.ui', status: 'completed', createdAt: 1, updatedAt: 10 },
      { taskId: 'latest', workspaceId: 'demo', title: '新任务', targetPath: 'ui/New.ui', status: 'failed', createdAt: 2, updatedAt: 30 },
    ]) } } as unknown as DesktopApi;
    render(<TaskHistoryPanel api={api} workspaceId="demo" onOpenTask={onOpen} />);

    const latest = await screen.findByRole('button', { name: /New\.ui.*失败/ });
    expect(latest).toBeTruthy();
    await userEvent.setup().click(latest);
    expect(onOpen).toHaveBeenCalledWith('latest', 'New.ui');
    expect(api.ai?.listTaskSnapshots).toHaveBeenCalledWith({ workspaceId: 'demo' });
  });
});
