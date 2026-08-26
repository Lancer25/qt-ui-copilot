import { createHash } from 'node:crypto';
import { AiAttachmentSchema, type AiAttachment } from '@qt-ui-copilot/contracts';

export type ValidatedAttachment = AiAttachment & { bytes: Buffer };

const imageMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const textKinds = new Set(['ui', 'qss', 'qrc', 'source']);
const maxBytes = 10 * 1024 * 1024;

function decodeDataUrl(value: string, mimeType: string): Buffer {
  const prefix = `data:${mimeType};base64,`;
  if (!value.startsWith(prefix)) throw new Error(`invalid data URL for ${mimeType}`);
  try { return Buffer.from(value.slice(prefix.length), 'base64'); }
  catch { throw new Error('invalid base64 attachment'); }
}

/** Re-checks renderer-provided attachments at the Main boundary. */
export class AttachmentService {
  validate(input: AiAttachment[]): ValidatedAttachment[] {
    const parsed = input.map((item) => AiAttachmentSchema.parse(item));
    if (parsed.filter((item) => item.kind === 'image').length > 4) throw new Error('at most four image attachments are allowed');
    if (parsed.reduce((sum, item) => sum + item.size, 0) > 24 * 1024 * 1024) throw new Error('attachments exceed the 24MB total limit');
    const ids = new Set<string>();
    return parsed.map((item) => {
      if (ids.has(item.id)) throw new Error(`duplicate attachment id: ${item.id}`);
      ids.add(item.id);
      if (item.size > maxBytes) throw new Error(`attachment exceeds 10MB: ${item.name}`);
      let bytes: Buffer;
      if (item.kind === 'image') {
        if (!imageMimes.has(item.mimeType) || !item.dataUrl) throw new Error(`unsupported image attachment: ${item.name}`);
        bytes = decodeDataUrl(item.dataUrl, item.mimeType);
      } else {
        if (!textKinds.has(item.kind) || item.text === undefined) throw new Error(`invalid text attachment: ${item.name}`);
        bytes = Buffer.from(item.text, 'utf8');
      }
      if (bytes.length === 0 || bytes.length > maxBytes) throw new Error(`attachment byte size invalid: ${item.name}`);
      if (bytes.length !== item.size) throw new Error(`attachment size mismatch: ${item.name}`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== item.contentHash) throw new Error(`attachment hash mismatch: ${item.name}`);
      return { ...item, bytes };
    });
  }
}

