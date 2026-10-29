// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentPreviewSurface } from './ComponentPreviewSurface';

afterEach(cleanup);

const base = { title: '数据表格面板', canPreview: true, rendering: false, onGenerate: vi.fn(), onOpen: vi.fn() };

describe('ComponentPreviewSurface', () => {
  it('shows an explanation without invalid actions when preview is unavailable', () => {
    render(<ComponentPreviewSurface {...base} canPreview={false} />);
    expect(screen.getByText('该组件未提供可预览内容')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses the empty preview canvas to start rendering', async () => {
    const onGenerate = vi.fn();
    render(<ComponentPreviewSurface {...base} onGenerate={onGenerate} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '生成组件预览' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('keeps a stable loading canvas', () => {
    render(<ComponentPreviewSurface {...base} rendering />);
    expect(screen.getByRole('status').textContent).toContain('正在生成预览');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows an inline retry action after rendering fails', async () => {
    const onGenerate = vi.fn();
    render(<ComponentPreviewSurface {...base} error="PreviewHost 启动失败" onGenerate={onGenerate} />);
    expect(screen.getByRole('alert').textContent).toContain('PreviewHost 启动失败');
    await userEvent.setup().click(screen.getByRole('button', { name: '重试预览' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('opens an existing screenshot without regenerating and exposes refresh separately', async () => {
    const onGenerate = vi.fn();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ComponentPreviewSurface {...base} imageDataUrl="data:image/png;base64,AA==" onGenerate={onGenerate} onOpen={onOpen} />);
    await user.click(screen.getByRole('button', { name: '打开数据表格面板预览大图' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onGenerate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '重新生成预览' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
