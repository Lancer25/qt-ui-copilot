// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readAttachment, validateAttachmentSet, type AiAttachment } from './attachment-reader';

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const file = (name: string, type: string, bytes: Uint8Array = pngBytes) => new File([bytes], name, { type, lastModified: 1 });
const image = (id: string): AiAttachment => ({ id, name: `${id}.png`, kind: 'image', mimeType: 'image/png', size: 12, contentHash: 'a'.repeat(64), dataUrl: 'data:image/png;base64,AA==' });

describe('attachment-reader', () => {
  it('accepts a PNG and rejects executables and oversized files', async () => {
    await expect(readAttachment(file('screen.png', 'image/png'))).resolves.toMatchObject({ kind: 'image', name: 'screen.png' });
    await expect(readAttachment(file('bad.exe', 'application/x-msdownload', new Uint8Array([1])))).rejects.toThrow('不支持');
    const oversized = { size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0), name: 'large.png', type: 'image/png', lastModified: 1 } as unknown as File;
    await expect(readAttachment(oversized)).rejects.toThrow('大小');
  });

  it('accepts UTF-8 Qt text and enforces the image and total limits', async () => {
    await expect(readAttachment(file('MainWindow.ui', 'application/xml', new TextEncoder().encode('<ui/>')))).resolves.toMatchObject({ kind: 'ui', text: '<ui/>' });
    expect(validateAttachmentSet([image('1'), image('2'), image('3'), image('4'), image('5')])).toMatchObject({ ok: false, code: 'too_many_images' });
    expect(validateAttachmentSet(Array.from({ length: 3 }, (_, index) => ({ ...image(String(index)), size: 9 * 1024 * 1024 })))).toMatchObject({ ok: false, code: 'attachments_too_large' });
  });
});
