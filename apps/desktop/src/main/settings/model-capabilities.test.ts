import { describe, expect, it } from 'vitest';
import { testModelCapability, type ModelCapabilitySettings } from './model-capabilities';

const settings: ModelCapabilitySettings = { baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-plus', apiKey: 'sk-sp-secret' };
const okCompletion = (content: string): Response => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe('model capability checks', () => {
  it.each(['text', 'json', 'vision'] as const)('returns a successful %s capability result', async (capability) => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const result = await testModelCapability(settings, capability, async (url, init) => { requests.push({ url: String(url), init }); return okCompletion(capability === 'json' ? '{"ok":true}' : 'OK'); });
    expect(result).toMatchObject({ capability, ok: true, status: 200, model: settings.model });
    expect(requests[0]?.url).toBe(`${settings.baseUrl}/chat/completions`);
    expect(String(requests[0]?.init?.body)).not.toContain(settings.apiKey);
  });

  it('sends a real image for the vision capability check', async () => {
    const requests: RequestInit[] = [];
    await testModelCapability(settings, 'vision', async (_url, init) => { requests.push(init!); return okCompletion('purple square'); });
    const body = JSON.parse(String(requests[0]?.body)) as { enable_thinking?: boolean; messages: Array<{ content: unknown }> };
    expect(body.enable_thinking).toBe(false);
    expect(body.messages[0]?.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'image_url', image_url: expect.objectContaining({ url: expect.stringMatching(/^data:image\/png;base64,/) }) }),
    ]));
  });

  it('requests JSON mode and validates the returned JSON', async () => {
    const requests: RequestInit[] = [];
    await expect(testModelCapability(settings, 'json', async (_url, init) => { requests.push(init!); return okCompletion('{"ok":true}'); })).resolves.toMatchObject({ ok: true });
    const body = JSON.parse(String(requests[0]?.body)) as { response_format: unknown };
    expect(body.response_format).toEqual({ type: 'json_object' });
    await expect(testModelCapability(settings, 'json', async () => okCompletion('not-json'))).resolves.toMatchObject({ ok: false, code: 'invalid_json' });
  });

  it('retains DeepSeek thinking-disabled behavior', async () => {
    const requests: RequestInit[] = [];
    await testModelCapability({ ...settings, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' }, 'text', async (_url, init) => { requests.push(init!); return okCompletion('OK'); });
    const body = JSON.parse(String(requests[0]?.body)) as { thinking?: unknown; enable_thinking?: unknown };
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.enable_thinking).toBeUndefined();
  });

  it('redacts keys and classifies HTTP, network, and timeout errors', async () => {
    await expect(testModelCapability(settings, 'text', async () => new Response(JSON.stringify({ error: { message: 'bad key sk-sp-secret' } }), { status: 401 }))).resolves.toMatchObject({ ok: false, status: 401, code: 'authentication_failed' });
    const unauthorized = await testModelCapability(settings, 'text', async () => new Response(JSON.stringify({ error: { message: 'bad key sk-sp-secret' } }), { status: 401 }));
    expect(unauthorized.message).not.toContain(settings.apiKey);
    await expect(testModelCapability(settings, 'text', async () => { throw new Error('connection failed'); })).resolves.toMatchObject({ ok: false, code: 'network_error' });
    await expect(testModelCapability(settings, 'text', async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }),), 10)).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });
});
