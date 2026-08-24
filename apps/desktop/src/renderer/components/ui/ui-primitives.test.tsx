// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Field } from './Field';

describe('V2 UI primitives', () => {
  afterEach(cleanup);

  it('renders a loading primary button without accepting clicks', async () => {
    const onClick = vi.fn();
    render(<Button variant="primary" loading onClick={onClick}>保存</Button>);
    const button = screen.getByRole('button', { name: '保存' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('connects Field errors to the input description', () => {
    render(<Field label="Qt 路径" error="目录不存在"><input /></Field>);
    const textbox = screen.getByRole('textbox');
    const descriptionId = textbox.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId as string)?.textContent).toBe('目录不存在');
    expect(textbox.getAttribute('aria-invalid')).toBe('true');
  });

  it('provides consistent semantic building blocks', () => {
    render(<Card aria-label="配置"><Badge tone="success">已连接</Badge><EmptyState title="暂无项目" /></Card>);
    expect(screen.getByRole('region', { name: '配置' })).toBeTruthy();
    expect(screen.getByText('已连接').classList.contains('ui-badge--success')).toBe(true);
    expect(screen.getByRole('heading', { name: '暂无项目' })).toBeTruthy();
  });
});
