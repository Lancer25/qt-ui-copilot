// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import { UiSourceTab } from './UiSourceTab';

afterEach(cleanup);

describe('UiSourceTab', () => {
  it('shows path, read-only status, line numbers and copy feedback', async () => {
    const writeText = vi.fn(async () => undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const api = { workspace: { readText: vi.fn(async () => 'first line\nsecond line') } } as unknown as DesktopApi;
    render(<UiSourceTab api={api} workspaceId="workspace" filePath="D:/demo/main.cpp" />);

    expect(screen.getByTitle('D:/demo/main.cpp')).toBeTruthy();
    expect(screen.getByText('只读')).toBeTruthy();
    await screen.findByText('second line');
    expect(document.querySelectorAll('.v3-source-line__number')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '复制全部源码' }));
    expect(writeText).toHaveBeenCalledWith('first line\nsecond line');
    expect((await screen.findByRole('status')).textContent).toContain('已复制');
  });

  it('renders a bounded error card when the file cannot be read', async () => {
    const api = { workspace: { readText: vi.fn(async () => { throw new Error('Access denied'); }) } } as unknown as DesktopApi;
    render(<UiSourceTab api={api} workspaceId="workspace" filePath="D:/demo/main.cpp" />);
    expect((await screen.findByRole('alert')).textContent).toContain('无法读取源码');
    expect(screen.getByRole('alert').textContent).toContain('Access denied');
  });
});
