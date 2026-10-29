import { describe, expect, it } from 'vitest';
import { friendlyComponentError } from './component-error';

describe('friendlyComponentError', () => {
  it.each([
    ["Error invoking remote method 'v3.componentSources.preview': Error: 请先在设置中绑定 Qt Kit，再预览组件", { title: '需要配置 Qt Kit', detail: '请先在设置的 Qt Kits 中添加或选择可用环境。', action: 'settings' }],
    ['Error: PreviewHost did not return an image path', { title: '预览生成失败', detail: 'PreviewHost did not return an image path', action: 'retry' }],
    ['Unable to initialize the MSVC build environment', { title: '预览环境不可用', detail: 'Unable to initialize the MSVC build environment', action: 'settings' }],
  ] as const)('normalizes %s', (input, expected) => {
    expect(friendlyComponentError(new Error(input))).toEqual(expected);
  });
});
