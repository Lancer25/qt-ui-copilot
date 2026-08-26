import { VisualEnhancementPlanSchema, type VisualEnhancementPlan } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider } from '@qt-ui-copilot/agent-workflow';

export interface UiEnhancementPlannerInput { requirement: string; baseUi: string; referenceImage?: { name: string; mimeType: string; dataUrl: string }; objectNames: string[]; }
const schema = '{"operations":[{"op":"setFont","target":"titleLabel","value":{"pointSize":18,"bold":true}}]}';
export class UiEnhancementPlanner {
  constructor(private readonly model: ModelProvider) {}
  async plan(input: UiEnhancementPlannerInput): Promise<VisualEnhancementPlan> {
    const request = { requirement: input.requirement.trim(), baseUi: input.baseUi, objectNames: input.objectNames, visualAttachments: input.referenceImage ? [input.referenceImage] : [], allowedSchema: schema };
    const prompt = '你是 Qt Widgets 视觉增强规划器。只返回 VisualEnhancementPlan JSON，只使用允许的增强操作，不要 XML、C++、脚本或任意路径。';
    try { return VisualEnhancementPlanSchema.parse(asJsonValue(await this.model.generate({ kind: 'ui_enhancement', systemPrompt: prompt, input: request, responseSchema: schema }))); }
    catch (error) { return VisualEnhancementPlanSchema.parse(asJsonValue(await this.model.generate({ kind: 'format_repair', systemPrompt: `${prompt} 修复格式错误，只返回合法 JSON。`, input: { ...request, validationError: String(error), repair: true }, responseSchema: schema }))); }
  }
}
