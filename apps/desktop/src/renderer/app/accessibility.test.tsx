// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

afterEach(() => cleanup());

describe('V2 shell accessibility', () => {
  it('exposes an accessible close action for closable tabs', async () => {
    const user = userEvent.setup();
    render(<AppShell activePage={<div />} />);
    await user.click(screen.getByRole('button', { name: /设置/ }));
    expect(screen.getByRole('tab', { name: '设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '关闭设置' })).toBeTruthy();
  });
});
