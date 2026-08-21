/**
 * A deliberately small, provider-neutral boundary. Concrete adapters may use
 * OpenAI-compatible HTTP, a local model, or an IDE agent; this package never
 * owns credentials or performs network I/O itself.
 */
export interface ModelRequest {
  kind: 'ui_plan' | 'visual_review' | 'format_repair';
  systemPrompt: string;
  input: Record<string, unknown>;
  responseSchema: string;
}

export interface ModelProvider {
  generate(request: ModelRequest): Promise<unknown>;
}

export function asJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); }
  catch { return value; }
}
