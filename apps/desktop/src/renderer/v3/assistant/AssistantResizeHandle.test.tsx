// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantResizeHandle, ASSISTANT_WIDTH_DEFAULT } from './AssistantResizeHandle';

afterEach(cleanup);

describe('AssistantResizeHandle', () => {
  it('clamps drag width and restores the default on double click', () => {
    function Harness() { const [width, setWidth] = useState(360); return <><AssistantResizeHandle width={width} onWidthChange={setWidth} onReset={() => setWidth(ASSISTANT_WIDTH_DEFAULT)} /><output data-testid="assistant-width">{width}</output></>; }
    render(<Harness />);
    const separator = screen.getByRole('separator');
    fireEvent.mouseDown(separator, { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: 200 });
    expect(screen.getByTestId('assistant-width').textContent).toBe('640');
    fireEvent.doubleClick(separator);
    expect(screen.getByTestId('assistant-width').textContent).toBe(String(ASSISTANT_WIDTH_DEFAULT));
  });

  it('supports keyboard edge commands', () => {
    const onWidthChange = vi.fn();
    render(<AssistantResizeHandle width={360} onWidthChange={onWidthChange} onReset={vi.fn()} />);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'Home' });
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onWidthChange).toHaveBeenNthCalledWith(1, 300);
    expect(onWidthChange).toHaveBeenNthCalledWith(2, 640);
  });
});
