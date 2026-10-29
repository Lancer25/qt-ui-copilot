// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskComposer } from './TaskComposer';

describe('TaskComposer build selection', () => {
  afterEach(cleanup);
  it('uses readable segmented buttons and submits the selected backend', async () => {
    const submit = vi.fn(); const user = userEvent.setup();
    render(<TaskComposer creationMode onSubmit={submit} />);
    expect(screen.queryByRole('combobox', { name: '构建后端' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'QMake' }));
    expect(screen.getByRole('button', { name: 'QMake' }).getAttribute('aria-pressed')).toBe('true');
    await user.type(screen.getByRole('textbox', { name: '发送给 AI' }), '创建应用');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ createProject: true, buildBackend: 'qmake', useComponentLibrary: true }));
  });

  it('disables build selection for UI-only creation', async () => {
    const user = userEvent.setup(); render(<TaskComposer creationMode onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '仅界面' }));
    expect((screen.getByRole('button', { name: 'QMake' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('构建方式').getAttribute('aria-disabled')).toBe('true');
  });

  it('applies a new starter prompt without submitting it', () => {
    const submit = vi.fn();
    const view = render(<TaskComposer seed={{ id: 1, text: '创建登录页' }} onSubmit={submit} />);
    expect((screen.getByRole('textbox', { name: '发送给 AI' }) as HTMLTextAreaElement).value).toBe('创建登录页');
    view.rerender(<TaskComposer seed={{ id: 2, text: '编译运行项目' }} onSubmit={submit} />);
    expect((screen.getByRole('textbox', { name: '发送给 AI' }) as HTMLTextAreaElement).value).toBe('编译运行项目');
    expect(submit).not.toHaveBeenCalled();
  });

  it('shows selected component count and can disable the library for this task', async () => {
    const submit = vi.fn(); const user = userEvent.setup();
    render(<TaskComposer creationMode componentCount={3} onSubmit={submit} />);
    const toggle = screen.getByRole('button', { name: /引用组件库/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.querySelector('svg')).toBeTruthy();
    expect(toggle.textContent).toContain('组件库 · 3');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toContain('忽略');
    await user.type(screen.getByRole('textbox', { name: '发送给 AI' }), '创建页面');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ useComponentLibrary: false }));
  });

  it('hides component library configuration when modifying an existing UI', () => {
    render(<TaskComposer creationMode={false} componentCount={2} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /引用组件库/ })).toBeNull();
  });
});
