import { CanonicalUiIntentSchema, type CanonicalUiIntent, type UiCapabilityCandidate } from '@qt-ui-copilot/contracts';
import { asJsonValue, type ModelProvider, type ModelRequest } from '@qt-ui-copilot/agent-workflow';

export interface UiIntentPlannerInput { requirement: string; targetQtVersion: string; fileName: string; rootType: CanonicalUiIntent['rootType']; referenceImages?: Array<{ name: string; mimeType: string; dataUrl: string }>; capabilityCandidates?: UiCapabilityCandidate[]; }
const schema = '{"fileName":"Login.ui","rootType":"QWidget","rootObjectName":"login","windowTitle":"登录","size":{"width":520,"height":360},"tree":{"kind":"layout","role":"main","layout":"vertical","children":[]},"expectedResults":["可被 Qt uic 编译"]}';
const prompt = '你是 Qt Widgets 基础界面规划器。只返回 CanonicalUiIntent JSON，不要 XML、C++、QSS 或任意 Qt 属性。只描述控件、布局、文本和层级。目标兼容 Qt 5.9.6。若提供能力候选，只能在节点上使用候选中的 capabilityId，不能猜测或生成新的 ID。';

export class UiIntentPlanner {
  constructor(private readonly model: ModelProvider) {}
  async plan(input: UiIntentPlannerInput): Promise<CanonicalUiIntent> {
    // Candidates are an application-owned allow-list. Keep the payload small
    // and deterministic so the model never receives raw XML, headers or paths.
    const capabilityCandidates = (input.capabilityCandidates ?? []).slice(0, 20).map((candidate) => ({
      capabilityId: candidate.capabilityId,
      displayName: candidate.displayName,
      kind: candidate.kind,
      description: candidate.description,
      tags: candidate.tags,
      dependencyStatus: candidate.dependencyStatus,
      reasons: candidate.reasons,
    }));
    const request = { requirement: input.requirement.trim(), targetQtVersion: input.targetQtVersion, fileName: input.fileName, rootType: input.rootType, visualAttachments: input.referenceImages ?? [], capabilityCandidates, allowedSchema: schema };
    const parse = (value: unknown) => CanonicalUiIntentSchema.parse(asJsonValue(value));
    try { return parse(await this.model.generate({ kind: 'ui_intent', systemPrompt: prompt, input: request, responseSchema: schema })); }
    catch (error) { return parse(await this.model.generate({ kind: 'format_repair', systemPrompt: `${prompt} 修复上一次输出，只返回合法 JSON。`, input: { ...request, validationError: String(error), repair: true }, responseSchema: schema })); }
  }
}
