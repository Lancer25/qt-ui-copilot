import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AttachmentService } from './attachment-service';

const bytes = Buffer.from('abc');
const hash = createHash('sha256').update(bytes).digest('hex');
const image = { id: 'img', name: 'reference.png', kind: 'image' as const, mimeType: 'image/png', size: bytes.length, contentHash: hash, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` };

describe('AttachmentService', () => {
  it('revalidates bytes, hash and image limits in Main', () => {
    expect(new AttachmentService().validate([image])[0].bytes).toEqual(bytes);
    expect(() => new AttachmentService().validate([{ ...image, size: 4 }])).toThrow('size mismatch');
    expect(() => new AttachmentService().validate(Array.from({ length: 5 }, (_, index) => ({ ...image, id: `img-${index}` })))).toThrow('four image');
  });
});

