import { createHash } from 'node:crypto';
import type { CanonicalUiIntent, VisualEnhancementPlan, VisualEnhancementOperation } from '@qt-ui-copilot/contracts';
import { generateBaseUi, normalizeUiIntent, applyEnhancement } from '@qt-ui-copilot/ui-document';

export type UiCreationStage = 'preparing_context' | 'generating_intent' | 'normalizing_intent' | 'building_base_ui' | 'validating_base_ui' | 'generating_enhancements' | 'applying_enhancements' | 'validating_preview' | 'waiting_approval' | 'failed' | 'cancelled';
export interface UiCreationProgress { stage: UiCreationStage; message: string; warnings: Array<{ code: string; message: string }>; }
export interface UiCreationTaskInput { requirement: string; targetQtVersion: string; fileName: string; rootType: CanonicalUiIntent['rootType']; referenceImages?: Array<{ name: string; mimeType: string; dataUrl: string }>; }
export interface UiCreationTaskResult { baseSource: string; enhancedSource: string; baseHash: string; enhancedHash: string; warnings: Array<{ code: string; message: string }>; stage: UiCreationStage; }
export interface UiCreationTaskDeps { planIntent(input: UiCreationTaskInput): Promise<CanonicalUiIntent>; planEnhancements(input: { requirement: string; baseUi: string; objectNames: string[]; referenceImage?: { name: string; mimeType: string; dataUrl: string } }): Promise<VisualEnhancementPlan>; validateUic(source: string): Promise<boolean>; }

export class UiCreationTaskService {
  constructor(private readonly deps: UiCreationTaskDeps) {}

  async run(input: UiCreationTaskInput, onProgress?: (progress: UiCreationProgress) => void): Promise<UiCreationTaskResult> {
    const warnings: Array<{ code: string; message: string }> = [];
    const report = (stage: UiCreationStage, message: string) => onProgress?.({ stage, message, warnings: [...warnings] });
    report('preparing_context', '正在准备项目上下文');
    report('generating_intent', '正在生成基础界面意图');
    const rawIntent = await this.deps.planIntent(input);
    report('normalizing_intent', '正在规范化控件和布局');
    const normalized = normalizeUiIntent(rawIntent);
    warnings.push(...normalized.warnings.map((warning) => ({ code: warning.code, message: warning.message })));
    report('building_base_ui', '正在生成基础 .ui');
    const baseSource = generateBaseUi(normalized.intent).source;
    report('validating_base_ui', '正在执行基础 UI 校验');
    if (!await this.deps.validateUic(baseSource)) { report('failed', '基础 UI 未通过 uic 校验'); throw new Error('base_ui_uic_failed'); }
    let enhancedSource = baseSource;
    report('generating_enhancements', '正在规划视觉增强');
    const plan = await this.deps.planEnhancements({ requirement: input.requirement, baseUi: baseSource, objectNames: collectObjectNames(normalized.intent), referenceImage: input.referenceImages?.[0] });
    for (const operation of plan.operations) {
      report('applying_enhancements', `正在应用视觉增强：${operation.op}`);
      const applied = applyEnhancement(enhancedSource, operation as VisualEnhancementOperation);
      if (!applied.applied || !await this.deps.validateUic(applied.source)) { warnings.push({ code: 'enhancement_skipped', message: applied.warning?.message ?? `增强操作未通过校验：${operation.op}` }); continue; }
      enhancedSource = applied.source;
    }
    report('validating_preview', '基础版本和增强版本均已准备');
    report('waiting_approval', '等待用户审批保存');
    return { baseSource, enhancedSource, baseHash: hash(baseSource), enhancedHash: hash(enhancedSource), warnings, stage: 'waiting_approval' };
  }
}

function hash(source: string): string { return createHash('sha256').update(source).digest('hex'); }
function collectObjectNames(intent: CanonicalUiIntent): string[] { const names = [intent.rootObjectName]; const visit = (node: CanonicalUiIntent['tree']): void => { if (node.objectName) names.push(node.objectName); node.children.forEach(visit); }; visit(intent.tree); return names; }
