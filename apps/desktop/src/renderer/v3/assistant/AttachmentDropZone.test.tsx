// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentDropZone } from './AttachmentDropZone';

afterEach(cleanup);

describe('AttachmentDropZone', () => {
  it('accepts a dropped image and exposes an equivalent file picker', async () => {
    const onAdd = vi.fn();
    render(<AttachmentDropZone attachments={[]} onAdd={onAdd} />);
    const file = new File([new Uint8Array([1, 2, 3])], 'reference.png', { type: 'image/png' });
    fireEvent.drop(screen.getByLabelText('附件区域'), { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'reference.png', kind: 'image' })]));
    expect(screen.getByRole('button', { name: '选择附件' })).toBeTruthy();
  });

  it('reports unsupported files without adding them', async () => {
    const onAdd = vi.fn();
    const onError = vi.fn();
    render(<AttachmentDropZone attachments={[]} onAdd={onAdd} onError={onError} />);
    fireEvent.drop(screen.getByLabelText('附件区域'), { dataTransfer: { files: [new File([new Uint8Array([1])], 'bad.exe', { type: 'application/x-msdownload' })] } });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onAdd).not.toHaveBeenCalled();
  });
});
