// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskHistoryPanel } from './TaskHistoryPanel';
import type { DesktopApi } from '../../lib/api';

describe('TaskHistoryPanel', () => {
  it('lists recent tasks by update time and opens the selected task', async () => {
    const onOpen = vi.fn();
    const api = { tasks: { list: vi.fn(async () => [
      { id: 'older', projectId: 'demo', targetUi: 'ui/Old.ui', createdAt: 1, updatedAt: 10, lastEvent: { node: 'plan', status: 'completed', at: 10 } },
      { id: 'latest', projectId: 'demo', targetUi: 'ui/New.ui', createdAt: 2, updatedAt: 30, lastEvent: { node: 'preview', status: 'failed', at: 30 } },
    ]) } } as unknown as DesktopApi;
    render(<TaskHistoryPanel api={api} projectId="demo" onOpenTask={onOpen} />);

    const latest = await screen.findByRole('button', { name: /New\.ui.*失败/ });
    expect(latest).toBeTruthy();
    await userEvent.setup().click(latest);
    expect(onOpen).toHaveBeenCalledWith('latest', 'New.ui');
  });
});
