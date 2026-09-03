import { UiCreationBlueprintSchema, UiValueSchema, type AiAttachment, type UiCreationBlueprint } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider, type ModelRequest } from '@qt-ui-copilot/agent-workflow';
import { ZodError } from 'zod';

export interface UiCreationPlannerInput {
  contextMode?: 'focused_ui' | 'whole_project';
  requirement: string;
  attachments: AiAttachment[];
  targetQtVersion: string;
  fileName?: string;
  rootType?: 'QWidget' | 'QDialog' | 'QMainWindow';
  useProjectResources?: boolean;
  useComponentLibrary?: boolean;
}

export class UiCreationOutputInvalidError extends Error {
  readonly code = 'ui_creation_output_invalid';
  constructor(readonly details: string) { super(`UiCreationBlueprint schema validation failed: ${details}`); }
}

const blueprintDescription = JSON.stringify({
  fileName: 'LoginDialog.ui', rootType: 'QDialog', rootObjectName: 'loginDialog', windowTitle: '登录',
  size: { width: 520, height: 360 },
  layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [] },
  tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['窗口可以被 Qt uic 编译并预览'],
});

const systemPrompt = [
  '你是 Qt Widgets 界面蓝图规划器。只返回一个 JSON 对象，不要 Markdown、XML、C++、脚本或坐标。',
  '输出必须严格匹配 UiCreationBlueprint。生成的是结构化布局树，不是原始 .ui XML。',
  '目标最低兼容 Qt 5.9.6，只使用 QWidget/QDialog/QMainWindow 和 Qt Designer 常用标准控件、布局及属性。',
  '所有 objectName 必须唯一且符合 C++ 标识符；布局节点的 children 是子控件，widget 节点的 children 只能为空。',
].join(' ');

function errorText(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
  return error instanceof Error ? error.message : String(error);
}

function parseBlueprint(value: unknown): UiCreationBlueprint {
  const parsed = normalizeBlueprintProperties(normalizeFontValues(asJsonValue(value)));
  const result = UiCreationBlueprintSchema.safeParse(parsed);
  if (!result.success) throw new UiCreationOutputInvalidError(errorText(result.error));
  return result.data;
}

/** Keep compatibility with common model shorthand while preserving the strict
 * blueprint boundary. Table/list properties are represented as stringList in
 * the protocol; unknown or malformed properties are omitted rather than
 * invalidating an otherwise usable layout. */
function normalizeBlueprintProperties(value: unknown, root = true): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeBlueprintProperties(item, false));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  if (root) {
    const source = object;
    const rootType = source.rootType ?? source.rootClass ?? source.windowClass;
    const size = source.size && typeof source.size === 'object' && !Array.isArray(source.size) ? source.size as Record<string, unknown> : {};
    const normalizedRoot: Record<string, unknown> = {
      fileName: typeof (source.fileName ?? source.name) === 'string' ? (source.fileName ?? source.name) : 'NewWidget.ui',
      rootType: rootType === 'QDialog' || rootType === 'QMainWindow' ? rootType : 'QWidget',
      rootObjectName: typeof (source.rootObjectName ?? source.objectName ?? source.name) === 'string' ? (source.rootObjectName ?? source.objectName ?? source.name) : 'mainWindow',
      windowTitle: typeof (source.windowTitle ?? source.title) === 'string' ? (source.windowTitle ?? source.title) : 'Qt UI',
      size: { width: Number(size.width) >= 160 ? Number(size.width) : 900, height: Number(size.height) >= 120 ? Number(size.height) : 640 },
      layoutTree: normalizeBlueprintNode(source.layoutTree ?? source.tree ?? source.layout, 'mainLayout'),
    };
    for (const key of ['tabOrder', 'connections', 'resourceRefs', 'componentIds']) if (source[key] !== undefined) normalizedRoot[key] = source[key];
    if (source.expectedResults !== undefined) normalizedRoot.expectedResults = source.expectedResults;
    for (const key of ['tabOrder', 'connections', 'resourceRefs', 'componentIds']) if (normalizedRoot[key] === undefined) normalizedRoot[key] = [];
    if (normalizedRoot.expectedResults === undefined) normalizedRoot.expectedResults = ['界面可被 Qt uic 编译并预览'];
    return normalizeBlueprintProperties(normalizedRoot, false);
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (key === 'layoutTree') { result[key] = normalizeBlueprintNode(item, 'mainLayout'); continue; }
    if (['tabOrder', 'resourceRefs', 'componentIds', 'expectedResults'].includes(key) && Array.isArray(item)) {
      result[key] = item.map((entry) => typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? String((entry as Record<string, unknown>).path ?? (entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).id ?? '') : '').filter(Boolean);
      continue;
    }
    if (key === 'connections' && Array.isArray(item)) { result[key] = item.filter((entry) => entry && typeof entry === 'object').map((entry) => { const row = entry as Record<string, unknown>; return { sender: String(row.sender ?? row.from ?? ''), signal: String(row.signal ?? ''), receiver: String(row.receiver ?? row.to ?? ''), slot: String(row.slot ?? '') }; }).filter((entry) => entry.sender && entry.signal && entry.receiver && entry.slot); continue; }
    if (key === 'properties' && item && typeof item === 'object' && !Array.isArray(item)) {
      const properties: Record<string, unknown> = {};
      for (const [name, raw] of Object.entries(item as Record<string, unknown>)) {
        const normalized = name === 'items' || name === 'horizontalHeaderLabels'
          ? Array.isArray(raw) && raw.every((entry) => typeof entry === 'string') ? { kind: 'stringList', values: raw } : raw
          : normalizeBlueprintProperties(raw, false);
        if (UiValueSchema.safeParse(normalized).success) properties[name] = normalized;
      }
      result[key] = properties;
    } else result[key] = normalizeBlueprintProperties(item, false);
  }
  return result;
}

function normalizeBlueprintNode(value: unknown, fallbackName: string): Record<string, unknown> {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawKind = object.kind ?? object.type;
  const kind = rawKind === 'layout' || rawKind === 'spacer' || rawKind === 'widget' ? rawKind : 'widget';
  const rawClass = object.className ?? object.class ?? object.widgetClass ?? object.typeName;
  const className = typeof rawClass === 'string' && rawClass.trim() ? rawClass.trim() : kind === 'layout' ? 'QVBoxLayout' : kind === 'spacer' ? 'QSpacerItem' : 'QWidget';
  const rawName = object.objectName ?? object.name ?? object.id;
  const objectName = typeof rawName === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawName) ? rawName : fallbackName;
  const children = Array.isArray(object.children) ? object.children.map((child, index) => normalizeBlueprintNode(child, `${fallbackName}_${index + 1}`)) : [];
  const properties = object.properties && typeof object.properties === 'object' && !Array.isArray(object.properties) ? normalizeBlueprintProperties({ properties: object.properties }, false) as Record<string, unknown> : {};
  return { kind, className, objectName, properties: properties.properties ?? {}, children };
}

/** Qwen and other vision models often emit Qt font values without the
 * protocol discriminator. Normalize that one harmless shorthand before the
 * strict schema check; all other unknown structures remain rejected. */
function normalizeFontValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFontValues);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(object).map(([key, item]) => {
    if (key === 'font' && item && typeof item === 'object' && !Array.isArray(item) && !('kind' in (item as Record<string, unknown>))) return [key, { kind: 'font', ...(normalizeFontValues(item) as Record<string, unknown>) }];
    if (['minimumSize', 'maximumSize'].includes(key) && item && typeof item === 'object' && !Array.isArray(item) && !('kind' in (item as Record<string, unknown>))) {
      const normalized = normalizeFontValues(item) as Record<string, unknown>;
      if (typeof normalized.width === 'number' && typeof normalized.height === 'number') return [key, { kind: 'size', width: normalized.width, height: normalized.height }];
    }
    return [key, normalizeFontValues(item)];
  }));
}

/** Model-facing planner. It never accepts or emits raw XML. */
export class UiCreationPlanner {
  constructor(private readonly model: ModelProvider) {}

  async plan(input: UiCreationPlannerInput): Promise<UiCreationBlueprint> {
    const attachments = input.attachments.map(({ dataUrl: _dataUrl, text: _text, ...metadata }) => metadata);
    const visualAttachments = input.attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
      .map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl }));
    const requestInput: Record<string, unknown> = {
      requirement: input.requirement.trim(), contextMode: input.contextMode ?? 'focused_ui', targetQtVersion: input.targetQtVersion,
      fileName: input.fileName, rootType: input.rootType,
      useProjectResources: input.useProjectResources ?? true, useComponentLibrary: input.useComponentLibrary ?? true,
      attachments, visualAttachments, allowedBlueprintSchema: blueprintDescription,
    };
    try {
      return parseBlueprint(await this.model.generate(this.request(requestInput)));
    } catch (firstError) {
      // A provider rate limit/auth/server error is not a malformed blueprint;
      // do not immediately send a second repair request and make the outage
      // worse.
      if (firstError instanceof Error && /HTTP\s+(?:401|403|404|408|429|5\d\d)/i.test(firstError.message)) throw firstError;
      const repaired = await this.model.generate(this.request({
        ...requestInput,
        visualAttachments: [],
        invalidResponse: asJsonValue(firstError instanceof UiCreationOutputInvalidError ? firstError.details : firstError),
        validationError: errorText(firstError),
        repair: true,
      }));
      return parseBlueprint(repaired);
    }
  }

  private request(input: Record<string, unknown>): ModelRequest {
    return { kind: 'ui_creation', systemPrompt, input, responseSchema: blueprintDescription };
  }
}
