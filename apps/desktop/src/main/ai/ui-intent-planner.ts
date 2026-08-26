import { CanonicalUiIntentSchema, type CanonicalUiIntent } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider, type ModelRequest } from '@qt-ui-copilot/agent-workflow';

export interface UiIntentPlannerInput { requirement: string; targetQtVersion: string; fileName: string; rootType: CanonicalUiIntent['rootType']; referenceImages?: Array<{ name: string; mimeType: string; dataUrl: string }>; }
const schema = '{"fileName":"Login.ui","rootType":"QWidget","rootObjectName":"login","windowTitle":"登录","size":{"width":520,"height":360},"tree":{"kind":"layout","role":"main","layout":"vertical","children":[]},"expectedResults":["可被 Qt uic 编译"]}';
const prompt = '你是 Qt Widgets 基础界面规划器。只返回 CanonicalUiIntent JSON，不要 XML、C++、QSS 或任意 Qt 属性。只描述控件、布局、文本和层级。目标兼容 Qt 5.9.6。';

export class UiIntentPlanner {
  constructor(private readonly model: ModelProvider) {}
  async plan(input: UiIntentPlannerInput): Promise<CanonicalUiIntent> {
    const request = { requirement: input.requirement.trim(), targetQtVersion: input.targetQtVersion, fileName: input.fileName, rootType: input.rootType, visualAttachments: input.referenceImages ?? [], allowedSchema: schema };
    const parse = (value: unknown) => CanonicalUiIntentSchema.parse(asJsonValue(value));
    try { return parse(await this.model.generate({ kind: 'ui_intent', systemPrompt: prompt, input: request, responseSchema: schema })); }
    catch (error) { return parse(await this.model.generate({ kind: 'format_repair', systemPrompt: `${prompt} 修复上一次输出，只返回合法 JSON。`, input: { ...request, validationError: String(error), repair: true }, responseSchema: schema })); }
  }
}
