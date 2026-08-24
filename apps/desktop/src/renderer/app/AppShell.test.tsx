// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

afterEach(() => cleanup());

describe('AppShell', () => {
  it('renders primary navigation, workbench tab, and status', () => {
    render(<AppShell status={{ projectName: 'Demo' }} activePage={<h1>工作台内容</h1>} />);
    expect(screen.getByRole('button', { name: /工作台/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'AI 工作台' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('项目：Demo')).toBeTruthy();
  });

  it('calls navigation callback for a primary item and Ctrl shortcut', async () => {
    const onNavigate = vi.fn();
    render(<AppShell onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: /设置/ }));
    expect(onNavigate).toHaveBeenCalledWith('settings');
    await userEvent.keyboard('{Control>}6{/Control}');
    expect(onNavigate).toHaveBeenLastCalledWith('settings');
  });
});
