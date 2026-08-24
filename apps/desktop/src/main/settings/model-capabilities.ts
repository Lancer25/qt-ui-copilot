import { z } from 'zod';

export const ModelCapabilitySchema = z.enum(['text', 'json', 'vision']);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelCapabilityResultSchema = z.object({
  capability: ModelCapabilitySchema,
  ok: z.boolean(),
  status: z.number().int().optional(),
  code: z.string().max(64).optional(),
  message: z.string().max(1024).optional(),
  elapsedMs: z.number().int().nonnegative(),
  model: z.string().max(256),
}).strict();

export type ModelCapabilityResult = z.infer<typeof ModelCapabilityResultSchema>;
export interface ModelCapabilitySettings { baseUrl: string; model: string; apiKey?: string }

// Small embedded PNG used by the vision probe. It is deliberately kept in the
// Main process so capability checks never depend on renderer assets.
const VISION_PROBE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const diagnosticCode = (status: number): string => status === 401 || status === 403 ? 'authentication_failed'
  : status === 404 ? 'model_or_endpoint_not_found'
    : status === 429 ? 'rate_limited'
      : status >= 500 ? 'provider_unavailable' : 'model_request_failed';

export const sanitizeCapabilityMessage = (value: string, apiKey?: string): string => value
  .replaceAll(apiKey ?? '\u0000', '[REDACTED]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
  .replace(/(api[_-]?key|authorization)\s*[:=]\s*[^,\s}]+/gi, '$1: [REDACTED]')
  .slice(0, 1024);

const qwenLike = (settings: ModelCapabilitySettings): boolean => {
  try {
    const hostname = new URL(settings.baseUrl).hostname.toLowerCase();
    return hostname.includes('dashscope') || hostname.includes('maas.aliyuncs.com') || /^qwen/i.test(settings.model);
  } catch { return /^qwen/i.test(settings.model); }
};

const deepSeekLike = (settings: ModelCapabilitySettings): boolean => {
  try { return new URL(settings.baseUrl).hostname.toLowerCase() === 'api.deepseek.com'; } catch { return false; }
};

const parseErrorDetail = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown };
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch { /* preserve plain text */ }
  return raw;
};

function requestBody(settings: ModelCapabilitySettings, capability: ModelCapability): Record<string, unknown> {
  const qwen = qwenLike(settings);
  const deepSeek = deepSeekLike(settings);
  const body: Record<string, unknown> = {
    model: settings.model,
    stream: false,
    messages: [],
    ...(qwen ? { enable_thinking: false } : {}),
    ...(deepSeek ? { thinking: { type: 'disabled' } } : {}),
  };
  if (capability === 'text') {
    body.messages = [{ role: 'user', content: 'Reply with OK in plain text.' }];
    body.max_tokens = 16;
  } else if (capability === 'json') {
    body.messages = [{ role: 'user', content: 'Return exactly one JSON object: {"ok":true}.' }];
    body.response_format = { type: 'json_object' };
    body.max_tokens = 64;
  } else {
    body.messages = [{ role: 'user', content: [
      { type: 'text', text: 'Describe the image in one short sentence.' },
      { type: 'image_url', image_url: { url: VISION_PROBE_IMAGE } },
    ] }];
    body.max_tokens = 128;
  }
  return body;
}

export async function testModelCapability(
  settings: ModelCapabilitySettings,
  capability: ModelCapability,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<ModelCapabilityResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const base = { capability, model: settings.model } as const;
  try {
    const response = await fetchImpl(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}) },
      body: JSON.stringify(requestBody(settings, capability)),
      signal: controller.signal,
    });
    const raw = await response.text();
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) return { ...base, ok: false, status: response.status, code: diagnosticCode(response.status), message: sanitizeCapabilityMessage(`HTTP ${response.status}${raw ? `: ${parseErrorDetail(raw)}` : ''}`, settings.apiKey), elapsedMs };
    let content = '';
    try {
      const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
      const value = parsed.choices?.[0]?.message?.content;
      content = typeof value === 'string' ? value.trim() : '';
    } catch { /* response shape is reported as an unsuccessful capability */ }
    if (!content) return { ...base, ok: false, status: response.status, code: 'invalid_response', message: '模型响应中没有可用内容。', elapsedMs };
    if (capability === 'json') {
      try { JSON.parse(content); } catch { return { ...base, ok: false, status: response.status, code: 'invalid_json', message: '模型未返回有效 JSON。', elapsedMs }; }
    }
    return { ...base, ok: true, status: response.status, elapsedMs };
  } catch (error) {
    const aborted = error instanceof DOMException ? error.name === 'AbortError' : error instanceof Error && error.name === 'AbortError';
    return { ...base, ok: false, code: aborted ? 'timeout' : 'network_error', message: aborted ? `模型服务连接超时（${Math.max(1, Math.round(timeoutMs / 1000))} 秒）。` : sanitizeCapabilityMessage(error instanceof Error ? error.message : String(error), settings.apiKey), elapsedMs: Date.now() - startedAt };
  } finally { clearTimeout(timeout); }
}
