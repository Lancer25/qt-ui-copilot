import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { readAttachment, validateAttachmentSet, type AiAttachment } from './attachment-reader';

export interface AttachmentDropZoneProps {
  attachments: readonly AiAttachment[];
  onAdd: (attachments: AiAttachment[]) => void;
  onError?: (message: string) => void;
  children?: ReactNode;
}

const accept = 'image/png,image/jpeg,image/webp,image/svg+xml,.ui,.qss,.qrc,.h,.hpp,.cpp,.cc,.cxx';

export function AttachmentDropZone({ attachments, onAdd, onError, children }: AttachmentDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const ingest = async (files: FileList | File[]) => {
    const additions: AiAttachment[] = [];
    try {
      for (const file of Array.from(files)) additions.push(await readAttachment(file));
      const next = [...attachments, ...additions];
      const validation = validateAttachmentSet(next);
      if (!validation.ok) throw new Error(validation.message);
      onAdd(additions);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setActive(false); if (event.dataTransfer.files.length) void ingest(event.dataTransfer.files); };
  return (
    <div
      aria-label="附件区域"
      className={`v3-attachment-drop${active ? ' is-active' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setActive(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setActive(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setActive(false); }}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" hidden multiple accept={accept} onChange={(event) => { if (event.target.files) void ingest(event.target.files); event.currentTarget.value = ''; }} />
      {children ?? <span>拖入图片或 Qt 文件</span>}
      <button type="button" className="v3-attachment-choose" onClick={() => inputRef.current?.click()}>选择附件</button>
    </div>
  );
}
