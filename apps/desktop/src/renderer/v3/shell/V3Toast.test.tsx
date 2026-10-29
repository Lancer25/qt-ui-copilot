// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V3Toast } from './V3Toast';

describe('V3Toast', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('dismisses success notifications after three seconds', () => {
    vi.useFakeTimers(); const dismiss = vi.fn();
    render(<V3Toast notice={{ id: 1, text: '保存成功', tone: 'success' }} onDismiss={dismiss} />);
    act(() => vi.advanceTimersByTime(2999)); expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1)); expect(dismiss).toHaveBeenCalledOnce();
  });
  it('keeps errors longer and supports manual close', () => {
    vi.useFakeTimers(); const dismiss = vi.fn();
    render(<V3Toast notice={{ id: 2, text: '保存失败', tone: 'error' }} onDismiss={dismiss} />);
    act(() => vi.advanceTimersByTime(3000)); expect(dismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' })); expect(dismiss).toHaveBeenCalledOnce();
  });
});
