/**
 * A deliberately small, provider-neutral boundary. Concrete adapters may use
 * OpenAI-compatible HTTP, a local model, or an IDE agent; this package never
 * owns credentials or performs network I/O itself.
 */
export interface ModelRequest {
  kind: 'ui_plan' | 'visual_review' | 'format_repair' | 'ui_creation' | 'ui_intent' | 'ui_enhancement';
  systemPrompt: string;
  input: Record<string, unknown>;
  responseSchema: string;
}

/**
 * Convert the attachment envelope used by UI creation into a provider-safe
 * chat message.  The model request remains JSON serialisable and carries only
 * metadata in `attachments`; image bytes are deliberately kept in the
 * separate private `visualAttachments` field and are never included in trace
 * payloads.
 */
export function providerInputContent(input: Record<string, unknown>, imagePayloadMode: 'base64_data_url' | 'remote_url' = 'base64_data_url'): unknown {
  const visualAttachments = input.visualAttachments;
  const images = Array.isArray(visualAttachments)
    ? visualAttachments.filter((item): item is { dataUrl: string } => {
      if (typeof item !== 'object' || item === null) return false;
      const dataUrl = (item as { dataUrl?: unknown }).dataUrl;
      return typeof dataUrl === 'string' && (imagePayloadMode === 'base64_data_url' ? dataUrl.startsWith('data:image/') : /^https?:\/\//i.test(dataUrl));
    })
    : [];
  if (imagePayloadMode === 'remote_url' && Array.isArray(visualAttachments) && visualAttachments.length > 0 && images.length === 0) {
    throw new Error('图片发送格式已设为远程图片 URL，但附件没有可用的 http(s) URL');
  }
  const textInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'visualAttachments'));
  return images.length > 0
    ? [{ type: 'text', text: JSON.stringify(textInput) }, ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))]
    : JSON.stringify(textInput);
}

export interface ModelProvider {
  generate(request: ModelRequest): Promise<unknown>;
}

export function asJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return value; }
}
