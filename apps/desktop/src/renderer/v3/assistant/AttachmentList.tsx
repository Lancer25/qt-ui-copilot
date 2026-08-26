import type { AiAttachment } from './attachment-reader';

export function AttachmentList({ attachments, onRemove }: { attachments: readonly AiAttachment[]; onRemove: (id: string) => void }) {
  if (!attachments.length) return null;
  return <div className="v3-attachment-list" aria-label="已添加附件">
    {attachments.map((attachment) => <div className="v3-attachment-card" key={attachment.id}>
      {attachment.kind === 'image' && attachment.dataUrl ? <img src={attachment.dataUrl} alt={attachment.name} /> : <span className="v3-attachment-kind" aria-hidden="true">{attachment.kind.toUpperCase()}</span>}
      <div className="v3-attachment-meta"><b title={attachment.name}>{attachment.name}</b><small>{formatBytes(attachment.size)} · {attachment.kind}</small></div>
      <button type="button" aria-label={`移除附件 ${attachment.name}`} onClick={() => onRemove(attachment.id)}>×</button>
    </div>)}
  </div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
