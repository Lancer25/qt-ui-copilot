export type AttachmentKind = 'image' | 'ui' | 'qss' | 'qrc' | 'source';

export interface AiAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  contentHash: string;
  dataUrl?: string;
  text?: string;
}

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; code: 'too_many_images' | 'too_many_attachments' | 'attachments_too_large' | 'invalid_attachment'; message: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const EXTENSION_KIND: Record<string, AttachmentKind> = { '.ui': 'ui', '.qss': 'qss', '.qrc': 'qrc', '.h': 'source', '.hpp': 'source', '.cpp': 'source', '.cc': 'source', '.cxx': 'source' };

function extension(name: string): string {
  const match = /\.[^.]+$/.exec(name.toLowerCase());
  return match?.[0] ?? '';
}

function kindFor(file: File): AttachmentKind | undefined {
  if (IMAGE_MIMES.has(file.type.toLowerCase())) return 'image';
  return EXTENSION_KIND[extension(file.name)];
}

function mimeFor(file: File, kind: AttachmentKind): string {
  if (kind === 'image') return file.type.toLowerCase();
  if (file.type) return file.type;
  const defaults: Record<Exclude<AttachmentKind, 'image'>, string> = { ui: 'application/xml', qss: 'text/plain', qrc: 'application/xml', source: 'text/plain' };
  return defaults[kind];
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前运行时不支持 SHA-256 文件校验');
  return bytesToHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

function dataUrlFor(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`读取附件失败：${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function bytesFor(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`读取附件失败：${file.name}`));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

export async function readAttachment(file: File): Promise<AiAttachment> {
  const kind = kindFor(file);
  if (!kind) throw new Error(`不支持的附件类型：${file.name}`);
  const declaredLimit = kind === 'image' ? MAX_FILE_BYTES : MAX_TEXT_BYTES;
  if (file.size > declaredLimit) throw new Error(`附件超过大小限制：${file.name}`);
  const bytes = await bytesFor(file);
  if (bytes.byteLength > declaredLimit) throw new Error(`附件超过大小限制：${file.name}`);
  const attachment: AiAttachment = { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, kind, mimeType: mimeFor(file, kind), size: bytes.byteLength, contentHash: await sha256(bytes) };
  if (kind === 'image') {
    attachment.dataUrl = await dataUrlFor(file);
  } else {
    try {
      attachment.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`附件不是有效的 UTF-8 文本：${file.name}`);
    }
  }
  return attachment;
}

export function validateAttachmentSet(attachments: readonly AiAttachment[]): AttachmentValidationResult {
  const images = attachments.filter((attachment) => attachment.kind === 'image');
  if (images.length > 4) return { ok: false, code: 'too_many_images', message: '最多添加 4 张图片' };
  if (attachments.length > 12) return { ok: false, code: 'too_many_attachments', message: '附件数量过多' };
  if (attachments.some((attachment) => attachment.size > (attachment.kind === 'image' ? MAX_FILE_BYTES : MAX_TEXT_BYTES))) return { ok: false, code: 'invalid_attachment', message: '存在超过单文件限制的附件' };
  if (attachments.reduce((total, attachment) => total + attachment.size, 0) > MAX_TOTAL_BYTES) return { ok: false, code: 'attachments_too_large', message: '附件总大小不能超过 24 MB' };
  return { ok: true };
}
