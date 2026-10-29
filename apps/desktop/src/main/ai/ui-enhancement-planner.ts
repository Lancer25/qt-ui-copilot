import { VisualEnhancementPlanSchema, type VisualEnhancementPlan } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider } from '@qt-ui-copilot/agent-workflow';

export interface UiEnhancementPlannerInput { requirement: string; baseUi: string; referenceImage?: { name: string; mimeType: string; dataUrl: string }; objectNames: string[]; }
const schema = '{"operations":[{"op":"setFont","target":"titleLabel","value":{"pointSize":18,"bold":true}},{"op":"setSizeBounds","target":"loginButton","minimum":{"width":120,"height":36}},{"op":"setLayoutMetrics","target":"mainLayout","spacing":12,"margins":[20,20,20,20]},{"op":"setAlignment","target":"titleLabel","value":"Qt::AlignCenter"},{"op":"setStyleToken","target":"loginButton","token":"primary"},{"op":"setResource","target":"logoLabel","resourcePath":":/images/logo.png"}]}';
export class UiEnhancementPlanner {
  constructor(private readonly model: ModelProvider) {}
  async plan(input: UiEnhancementPlannerInput): Promise<VisualEnhancementPlan> {
    const request = { requirement: input.requirement.trim(), baseUi: input.baseUi, objectNames: input.objectNames, visualAttachments: input.referenceImage ? [input.referenceImage] : [], allowedSchema: schema };
    const prompt = '你是 Qt Widgets 视觉增强规划器。只返回 VisualEnhancementPlan JSON，只使用允许的增强操作，不要 XML、C++、脚本或任意路径。';
    try { return parsePlan(await this.model.generate({ kind: 'ui_enhancement', systemPrompt: prompt, input: request, responseSchema: schema })); }
    catch (error) { return parsePlan(await this.model.generate({ kind: 'format_repair', systemPrompt: `${prompt} 修复格式错误，每个 operation 必须包含 op、target 以及该操作要求的字段，只返回合法 JSON。`, input: { ...request, validationError: String(error), repair: true }, responseSchema: schema })); }
  }
}

function parsePlan(value: unknown): VisualEnhancementPlan {
  const decoded = asJsonValue(value);
  const source = Array.isArray(decoded) ? decoded : decoded && typeof decoded === 'object' && 'operations' in decoded && Array.isArray(decoded.operations) ? decoded.operations : [];
  return VisualEnhancementPlanSchema.parse({ operations: source.map(normalizeOperation) });
}

function normalizeOperation(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const raw = value as Record<string, unknown>;
  const target = raw.target;
  const alias = String(raw.op ?? raw.type ?? raw.operation ?? raw.action ?? '').replace(/[_\s-]/g, '').toLowerCase();
  const aliases: Record<string, string> = { setfont: 'setFont', fontsize: 'setFont', setsizebounds: 'setSizeBounds', sizebounds: 'setSizeBounds', setlayoutmetrics: 'setLayoutMetrics', layoutmetrics: 'setLayoutMetrics', setalignment: 'setAlignment', alignment: 'setAlignment', setstyletoken: 'setStyleToken', styletoken: 'setStyleToken', setresource: 'setResource', resource: 'setResource' };
  let op = aliases[alias];
  if (!op) {
    if (raw.token !== undefined || /(?:style|color|background|theme)/i.test(String(raw.property ?? raw.name ?? ''))) op = 'setStyleToken';
    else if (raw.resourcePath !== undefined) op = 'setResource';
    else if (raw.minimum !== undefined || raw.maximum !== undefined) op = 'setSizeBounds';
    else if (raw.spacing !== undefined || raw.margins !== undefined || raw.stretch !== undefined) op = 'setLayoutMetrics';
    else if (raw.value && typeof raw.value === 'object') op = 'setFont';
    else if (typeof raw.value === 'string') op = 'setAlignment';
  }
  if (op === 'setStyleToken') {
    const hint = String(raw.token ?? raw.value ?? raw.property ?? '').toLowerCase();
    const token = /danger|red|红|警告/.test(hint) ? 'danger' : /muted|gray|grey|弱|灰/.test(hint) ? 'muted' : /panel|card|面板/.test(hint) ? 'panel' : /title|标题/.test(hint) ? 'title' : /secondary|次要/.test(hint) ? 'secondary' : 'primary';
    return { op, target, token };
  }
  if (op === 'setFont') return { op, target, value: raw.value ?? raw.font ?? {} };
  if (op === 'setSizeBounds') return { op, target, ...(raw.minimum !== undefined ? { minimum: raw.minimum } : {}), ...(raw.maximum !== undefined ? { maximum: raw.maximum } : {}) };
  if (op === 'setLayoutMetrics') return { op, target, ...(raw.spacing !== undefined ? { spacing: raw.spacing } : {}), ...(raw.margins !== undefined ? { margins: raw.margins } : {}), ...(raw.stretch !== undefined ? { stretch: raw.stretch } : {}) };
  if (op === 'setAlignment') return { op, target, value: raw.value };
  if (op === 'setResource') return { op, target, resourcePath: raw.resourcePath };
  return { op: raw.op, target };
}
