import { describe, it, expect, vi } from 'vitest';
import { isConfigurationContinuation, isRetryableConfigurationFailure, routeTask } from './task-intent-router';

const referenceImage = { id: 'attachment-1', name: 'login.png', kind: 'image' as const, mimeType: 'image/png', size: 4096, contentHash: 'a'.repeat(64), dataUrl: 'data:image/png;base64,AAAA' };

describe('task intent routing', () => {
  it.each(['reply', 'build', 'run', 'build_run', 'ui'] as const)('preserves %s without converting it to generation', async action => {
    const generate = vi.fn(async () => ({ action, reply: '说明' }));
    expect(await routeTask({ generate }, '处理一下这个项目', { files: ['main.cpp', 'app.pro'] })).toEqual({ action, reply: '说明' });
    expect(generate.mock.calls).toHaveLength(1);
  });
  it.each([
    ['帮我编译并运行一下应用', 'build_run'],
    ['请重新构建项目', 'build'],
    ['现在启动应用', 'run'],
  ] as const)('routes explicit command “%s” without asking the model', async (requirement, action) => {
    const generate = vi.fn();
    expect(await routeTask({ generate }, requirement, {})).toEqual({ action, reply: '' });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['为什么编译失败？', '分析一下运行后没有窗口的原因', '不要编译运行'])('does not execute ambiguous or negated request “%s”', async requirement => {
    const generate = vi.fn(async () => ({ action: 'reply', reply: '分析结果' }));
    expect(await routeTask({ generate }, requirement, {})).toEqual({ action: 'reply', reply: '分析结果' });
  });
  it('rejects unknown actions rather than generating a UI', async () => {
    await expect(routeTask({ generate: async () => ({ action: 'shell' }) }, '测试', {})).rejects.toThrow();
  });
  it('routes an image-only request to UI creation without asking a model that never saw the image', async () => {
    const generate = vi.fn();
    expect(await routeTask({ generate }, '', {}, [referenceImage])).toEqual({ action: 'ui', reply: '' });
    expect(generate).not.toHaveBeenCalled();
  });
  it('still asks the model about an empty request that carries no reference image', async () => {
    const generate = vi.fn(async () => ({ action: 'reply', reply: '请描述需求' }));
    expect(await routeTask({ generate }, '', {})).toEqual({ action: 'reply', reply: '请描述需求' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('hands the reference image to the router instead of dropping it', async () => {
    let seen: Record<string, unknown> | undefined;
    const generate = vi.fn(async (request: { input: Record<string, unknown> }) => { seen = request.input; return { action: 'ui', reply: '' }; });
    await routeTask({ generate }, '按这张图做', {}, [referenceImage]);
    // Metadata travels as JSON; image bytes travel in the private visual field
    // the provider adapter turns into image content parts.
    expect(seen?.attachments).toEqual([{ id: 'attachment-1', name: 'login.png', kind: 'image', mimeType: 'image/png', size: 4096, contentHash: 'a'.repeat(64) }]);
    expect(seen?.visualAttachments).toEqual([{ name: 'login.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }]);
  });
  it.each(['我已经绑定qtkit', 'Qt Kit 已经配置好了', '继续执行', '重试'])('recognizes configuration continuation “%s”', requirement => {
    expect(isConfigurationContinuation(requirement)).toBe(true);
  });
  it('keeps configuration failures retryable without treating ordinary model errors as configuration', () => {
    expect(isRetryableConfigurationFailure('请先在项目设置中选择 Qt Kit（需要 uic）')).toBe(true);
    expect(isRetryableConfigurationFailure('模型请求超时')).toBe(false);
  });
  it('does not classify a schema or tool error that merely mentions uic as a missing binding', () => {
    // Reproduced from the reported task failure: the raw ZodError text used to
    // satisfy the `uic` alternative, so every rebind only repeated the failure.
    const schemaDump = '[ { "origin": "string", "code": "invalid_type", "path": [ "qt", "uic" ], "message": "Invalid input" } ]';
    expect(isRetryableConfigurationFailure(schemaDump)).toBe(false);
    expect(isRetryableConfigurationFailure('uic: unknown option --header-file')).toBe(false);
  });
});
