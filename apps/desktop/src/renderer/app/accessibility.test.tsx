// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

afterEach(() => cleanup());

describe('V2 shell accessibility', () => {
  it('exposes accessible primary navigation and tab controls', async () => {
    const user = userEvent.setup();
    render(<AppShell activePage={<div />} />);
    await user.click(screen.getByRole('button', { name: /设置/ }));
    expect(screen.queryByRole('tab', { name: '设置' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'AI 工作台' }).getAttribute('aria-selected')).toBe('true');
  });
});
