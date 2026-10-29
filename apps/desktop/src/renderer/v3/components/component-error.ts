export interface FriendlyComponentError {
  title: string;
  detail: string;
  action: 'retry' | 'settings';
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

export function friendlyComponentError(error: unknown): FriendlyComponentError {
  const detail = messageOf(error)
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  if (/PreviewHost\s+(?:build|构建)|NMake|MSBuild|CMakeFiles|编译环境/i.test(detail)) {
    return { title: 'PreviewHost 构建失败', detail: detail || 'PreviewHost 未能完成构建。', action: 'retry' };
  }
  if (/Qt\s*Kit|绑定\s*Qt|配置.*Qt|MSVC build environment|CMake.*(?:missing|not found)/i.test(detail)) {
    if (/Qt\s*Kit|绑定\s*Qt|配置.*Qt/i.test(detail)) return { title: '需要配置 Qt Kit', detail: '请先在设置的 Qt Kits 中添加或选择可用环境。', action: 'settings' };
    return { title: '预览环境不可用', detail, action: 'settings' };
  }
  return { title: '预览生成失败', detail: detail || '组件预览未能完成，请稍后重试。', action: 'retry' };
}
