import type { CanonicalUiIntent, CanonicalUiNode } from '@qt-ui-copilot/contracts';

export type IntentWarningCode =
  | 'object_name_repaired'
  | 'duplicate_name_repaired'
  | 'node_degraded'
  | 'widget_inferred'
  | 'default_size_applied';

export interface IntentWarning {
  code: IntentWarningCode;
  path: string;
  message: string;
}

const MAX_WARNINGS = 128;
const validWidgets = new Set([
  'container', 'label', 'button', 'lineEdit', 'textEdit', 'checkBox', 'comboBox', 'list', 'table',
]);
const validLayouts = new Set(['vertical', 'horizontal', 'grid', 'form']);
const validKinds = new Set(['widget', 'layout', 'spacer']);

type UntrustedNode = Partial<CanonicalUiNode> & Record<string, unknown>;
type UntrustedIntent = Partial<CanonicalUiIntent> & Record<string, unknown>;

/**
 * Converts model output into the deliberately small, deterministic intent DSL.
 * The planner is expected to validate its response, but this boundary remains
 * defensive because providers and repair responses are untrusted input.
 */
export function normalizeUiIntent(input: CanonicalUiIntent): { intent: CanonicalUiIntent; warnings: IntentWarning[] } {
  const source = input as unknown as UntrustedIntent;
  const warnings: IntentWarning[] = [];
  const usedNames = new Set<string>();

  const warn = (code: IntentWarningCode, path: string, message: string): void => {
    if (warnings.length < MAX_WARNINGS) warnings.push({ code, path, message });
  };

  const allocateName = (value: unknown, fallback: string, path: string): string => {
    const original = typeof value === 'string' ? value.trim() : '';
    let name = sanitizeObjectName(original || fallback);
    if (name !== original && original) {
      warn('object_name_repaired', path, `对象名“${original}”已修复为“${name}”。`);
    }
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const base = name;
    let suffix = 2;
    while (usedNames.has(`${base}_${suffix}`)) suffix += 1;
    name = `${base}_${suffix}`;
    usedNames.add(name);
    warn('duplicate_name_repaired', path, `对象名重复，已改为“${name}”。`);
    return name;
  };

  const normalizeNode = (value: unknown, path: string, index: number): CanonicalUiNode => {
    const node = (value && typeof value === 'object' ? value : {}) as UntrustedNode;
    const rawKind = typeof node.kind === 'string' ? node.kind : '';
    const kind = validKinds.has(rawKind) ? rawKind as CanonicalUiNode['kind'] : 'widget';
    if (kind !== rawKind) warn('node_degraded', path, `不支持的节点类型“${rawKind || '缺失'}”已降级为 widget。`);

    const role = typeof node.role === 'string' && node.role.trim() ? node.role.trim() : kind === 'layout' ? 'layout' : kind === 'spacer' ? 'spacer' : 'container';
    let widget: CanonicalUiNode['widget'];
    let layout: CanonicalUiNode['layout'];
    let inferredWidget = false;
    if (kind === 'layout') {
      const rawLayout = typeof node.layout === 'string' ? node.layout : '';
      layout = validLayouts.has(rawLayout) ? rawLayout as CanonicalUiNode['layout'] : 'vertical';
      if (layout !== rawLayout) warn('node_degraded', `${path}.layout`, `不支持的布局“${rawLayout || '缺失'}”已降级为 vertical。`);
    } else if (kind === 'widget') {
      const rawWidget = typeof node.widget === 'string' ? node.widget : '';
      const emptyContainerWithContent = rawWidget === 'container' && (!Array.isArray(node.children) || node.children.length === 0) && (typeof node.text === 'string' || typeof node.placeholder === 'string');
      if (!rawWidget || emptyContainerWithContent) {
        widget = inferWidget(node, role);
        inferredWidget = true;
        warn(widget === 'container' ? 'node_degraded' : 'widget_inferred', `${path}.widget`, widget === 'container' ? '缺少控件类型，已降级为 container。' : `缺少有效控件类型，已根据“${role}”推断为 ${widget}。`);
      } else {
        widget = validWidgets.has(rawWidget) ? rawWidget as CanonicalUiNode['widget'] : 'container';
        if (widget !== rawWidget) warn('node_degraded', `${path}.widget`, `不支持的控件“${rawWidget}”已降级为 container。`);
      }
    }

    const result: CanonicalUiNode = {
      kind,
      role,
      objectName: allocateName(node.objectName, `${kind}_${index + 1}`, `${path}.objectName`),
      children: Array.isArray(node.children)
        ? node.children.map((child, childIndex) => normalizeNode(child, `${path}.children[${childIndex}]`, childIndex))
        : [],
    };
    if (widget) result.widget = widget;
    if (layout) result.layout = layout;
    if (typeof node.capabilityId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(node.capabilityId)) result.capabilityId = node.capabilityId;
    if (typeof node.text === 'string' && !(inferredWidget && (widget === 'lineEdit' || widget === 'textEdit'))) result.text = node.text.slice(0, 2048);
    if (inferredWidget && (widget === 'lineEdit' || widget === 'textEdit') && typeof node.text === 'string' && typeof node.placeholder !== 'string') result.placeholder = node.text.slice(0, 2048);
    if (typeof node.placeholder === 'string') result.placeholder = node.placeholder.slice(0, 2048);
    if (typeof node.stretch === 'number' && Number.isFinite(node.stretch)) {
      result.stretch = Math.max(0, Math.min(100, Math.trunc(node.stretch)));
    }
    return result;
  };

  const size = normalizeSize(source.size, warn);
  const rootObjectName = allocateName(source.rootObjectName, 'mainWindow', 'rootObjectName');
  const rootType = source.rootType === 'QDialog' || source.rootType === 'QMainWindow' ? source.rootType : 'QWidget';
  const fileName = typeof source.fileName === 'string' && source.fileName.toLowerCase().endsWith('.ui') ? source.fileName : 'Untitled.ui';
  const tree = normalizeNode(source.tree, 'tree', 0);
  const expectedResults = Array.isArray(source.expectedResults)
    ? source.expectedResults.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 128)
    : ['基础界面结构已生成'];

  return {
    intent: {
      fileName,
      rootType,
      rootObjectName,
      windowTitle: typeof source.windowTitle === 'string' ? source.windowTitle.slice(0, 256) : '',
      size,
      tree,
      expectedResults: expectedResults.length ? expectedResults : ['基础界面结构已生成'],
    },
    warnings,
  };
}

function inferWidget(node: UntrustedNode, role: string): CanonicalUiNode['widget'] {
  const semantic = [role, node.objectName, node.text, node.placeholder].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();
  if (/(?:title|subtitle|label|caption|heading|标题|副标题)/i.test(role)) return 'label';
  if (/(?:table|grid|表格|数据表)/i.test(semantic)) return 'table';
  if (/(?:list|列表|清单)/i.test(semantic)) return 'list';
  if (/(?:combo|select|dropdown|下拉|选择框)/i.test(semantic)) return 'comboBox';
  if (/(?:remember|agree|check|checkbox|记住|同意|勾选|复选)/i.test(semantic)) return 'checkBox';
  if (/(?:button|btn|action|submit|login|register|confirm|cancel|save|next|back|登录|注册|确认|取消|保存|下一步|返回)/i.test(semantic)) return 'button';
  if (/(?:password|passwd|account|username|email|phone|search|input|lineedit|密码|账号|用户名|邮箱|手机|搜索|输入)/i.test(semantic) || typeof node.placeholder === 'string') return 'lineEdit';
  if (/(?:description|textedit|content|comment|备注|描述|正文|多行)/i.test(semantic)) return 'textEdit';
  if (typeof node.text === 'string' || /(?:title|subtitle|label|caption|welcome|hint|标题|欢迎|提示|说明)/i.test(semantic)) return 'label';
  return 'container';
}

function sanitizeObjectName(value: string): string {
  let result = value.replace(/[^A-Za-z0-9_]/g, '_');
  if (!result) result = 'widget';
  if (/^[0-9]/.test(result)) result = `_${result}`;
  return result.slice(0, 128);
}

function normalizeSize(value: unknown, warn: (code: IntentWarningCode, path: string, message: string) => void): { width: number; height: number } {
  if (!value || typeof value !== 'object') {
    warn('default_size_applied', 'size', '未提供有效窗口尺寸，已使用 900×640。');
    return { width: 900, height: 640 };
  }
  const candidate = value as { width?: unknown; height?: unknown };
  const width = typeof candidate.width === 'number' && Number.isFinite(candidate.width) ? Math.trunc(candidate.width) : 900;
  const height = typeof candidate.height === 'number' && Number.isFinite(candidate.height) ? Math.trunc(candidate.height) : 640;
  const normalized = { width: Math.max(160, Math.min(4096, width)), height: Math.max(120, Math.min(4096, height)) };
  if (normalized.width !== width || normalized.height !== height) warn('default_size_applied', 'size', '窗口尺寸不在支持范围内，已限制到安全范围。');
  return normalized;
}
