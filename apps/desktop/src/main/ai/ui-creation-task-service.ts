import { createHash } from 'node:crypto';
import type { BinaryComponentBuildMetadata, CanonicalUiIntent, UiCapabilityCandidate, VisualEnhancementPlan, VisualEnhancementOperation } from '@qt-ui-copilot/contracts';
import { generateBaseUi, normalizeUiIntent, applyEnhancement } from '@qt-ui-copilot/ui-document';

export type UiCreationStage = 'preparing_context' | 'generating_intent' | 'normalizing_intent' | 'building_base_ui' | 'validating_base_ui' | 'base_candidate_ready' | 'generating_enhancements' | 'applying_enhancements' | 'validating_preview' | 'preview_ready' | 'waiting_approval' | 'failed' | 'cancelled';
export interface UiCreationProgress { stage: UiCreationStage; message: string; warnings: Array<{ code: string; message: string }>; previewDataUrl?: string; previewStatus?: 'ready' | 'warning' | 'failed'; }
export interface UiCreationTaskInput { requirement: string; targetQtVersion: string; fileName: string; rootType: CanonicalUiIntent['rootType']; referenceImages?: Array<{ name: string; mimeType: string; dataUrl: string }>; capabilityCandidates?: UiCapabilityCandidate[]; }
export interface UiCreationBaseResult { baseSource: string; baseHash: string; intent: CanonicalUiIntent; componentIds: string[]; componentStylesheets: string[]; binaryComponents: BinaryComponentBuildMetadata[]; warnings: Array<{ code: string; message: string }>; stage: 'base_candidate_ready'; }
export interface UiCreationTaskResult { baseSource: string; enhancedSource: string; baseHash: string; enhancedHash: string; intent: CanonicalUiIntent; componentIds: string[]; componentStylesheets: string[]; binaryComponents: BinaryComponentBuildMetadata[]; warnings: Array<{ code: string; message: string }>; stage: UiCreationStage; }
export interface UiCreationTaskDeps {
  planIntent(input: UiCreationTaskInput): Promise<CanonicalUiIntent>;
  planEnhancements(input: { requirement: string; baseUi: string; objectNames: string[]; referenceImage?: { name: string; mimeType: string; dataUrl: string } }): Promise<VisualEnhancementPlan>;
  validateUic(source: string): Promise<boolean>;
  /** Optional deterministic application-owned capability materializer. */
  applyCapabilities?(input: { source: string; intent: CanonicalUiIntent; candidates: UiCapabilityCandidate[] }): { source: string; componentIds?: string[]; componentStylesheets?: string[]; stylesheets?: string[]; binaryComponents?: BinaryComponentBuildMetadata[]; warnings?: Array<{ code: string; message: string }> };
}

export class UiCreationTaskService {
  constructor(private readonly deps: UiCreationTaskDeps) {}

  /**
   * Runs only the authoritative generation lane. The returned source has
   * passed uic and is safe to stage/save while visual enhancement and native
   * preview continue in a separate lane.
   */
  async runBase(input: UiCreationTaskInput, onProgress?: (progress: UiCreationProgress) => void): Promise<UiCreationBaseResult> {
    const { intent, source, componentIds, componentStylesheets, binaryComponents, warnings, report } = await this.prepareBase(input, onProgress);
    report('base_candidate_ready', '基础 UI 已通过 uic 校验，可立即保存');
    return { baseSource: source, baseHash: hash(source), intent, componentIds, componentStylesheets, binaryComponents, warnings, stage: 'base_candidate_ready' };
  }

  async run(input: UiCreationTaskInput, onProgress?: (progress: UiCreationProgress) => void): Promise<UiCreationTaskResult> {
    const base = await this.prepareBase(input, onProgress);
    const { intent: sanitizedIntent, source: baseSource, componentIds, componentStylesheets, binaryComponents, warnings, report } = base;
    let enhancedSource = baseSource;
    report('generating_enhancements', '正在规划视觉增强');
    const plan = await this.deps.planEnhancements({ requirement: input.requirement, baseUi: baseSource, objectNames: collectObjectNames(sanitizedIntent), referenceImage: input.referenceImages?.[0] });
    for (const operation of plan.operations) {
      report('applying_enhancements', `正在应用视觉增强：${operation.op}`);
      const applied = applyEnhancement(enhancedSource, operation as VisualEnhancementOperation);
      if (!applied.applied || !await this.deps.validateUic(applied.source)) { warnings.push({ code: 'enhancement_skipped', message: applied.warning?.message ?? `增强操作未通过校验：${operation.op}` }); continue; }
      enhancedSource = applied.source;
    }
    report('validating_preview', '基础版本和增强版本均已准备');
    report('waiting_approval', '等待用户审批保存');
    return { baseSource, enhancedSource, intent: sanitizedIntent, componentIds, componentStylesheets, binaryComponents, baseHash: hash(baseSource), enhancedHash: hash(enhancedSource), warnings, stage: 'waiting_approval' };
  }

  private async prepareBase(input: UiCreationTaskInput, onProgress?: (progress: UiCreationProgress) => void): Promise<{ intent: CanonicalUiIntent; source: string; componentIds: string[]; componentStylesheets: string[]; binaryComponents: BinaryComponentBuildMetadata[]; warnings: Array<{ code: string; message: string }>; report: (stage: UiCreationStage, message: string) => void }> {
    const warnings: Array<{ code: string; message: string }> = [];
    const report = (stage: UiCreationStage, message: string) => onProgress?.({ stage, message, warnings: [...warnings] });
    report('preparing_context', '正在准备项目上下文');
    report('generating_intent', '正在生成基础界面意图');
    const rawIntent = await this.deps.planIntent(input);
    report('normalizing_intent', '正在规范化控件和布局');
    // The form owns the destination identity; the model may describe the
    // layout but must not rename or change the requested root window.
    const normalized = normalizeUiIntent({ ...rawIntent, fileName: input.fileName, rootType: input.rootType });
    warnings.push(...normalized.warnings.map((warning) => ({ code: warning.code, message: warning.message })));
    const allowedCapabilities = new Set((input.capabilityCandidates ?? []).slice(0, 20).map((candidate) => candidate.capabilityId));
    const unknownCapabilities: string[] = [];
    const sanitizedIntent = stripUnknownCapabilities(normalized.intent, allowedCapabilities, unknownCapabilities);
    for (const capabilityId of unknownCapabilities) warnings.push({ code: 'capability_unknown', message: `未注册或未提供的能力“${capabilityId}”已降级为语义控件。` });
    report('building_base_ui', '正在生成基础 .ui');
    const generatedBase = generateBaseUi(sanitizedIntent).source;
    const materialized = this.deps.applyCapabilities?.({ source: generatedBase, intent: sanitizedIntent, candidates: (input.capabilityCandidates ?? []).slice(0, 20) }) ?? { source: generatedBase };
    if (materialized.warnings) warnings.push(...materialized.warnings);
    const source = materialized.source;
    report('validating_base_ui', '正在执行基础 UI 校验');
    if (!await this.deps.validateUic(source)) { report('failed', '基础 UI 未通过 uic 校验'); throw new Error('base_ui_uic_failed'); }
    return { intent: sanitizedIntent, source, componentIds: materialized.componentIds ?? [], componentStylesheets: materialized.stylesheets ?? [], binaryComponents: materialized.binaryComponents ?? [], warnings, report };
  }
}

function hash(source: string): string { return createHash('sha256').update(source).digest('hex'); }
function collectObjectNames(intent: CanonicalUiIntent): string[] { const names = [intent.rootObjectName]; const visit = (node: CanonicalUiIntent['tree']): void => { if (node.objectName) names.push(node.objectName); node.children.forEach(visit); }; visit(intent.tree); return names; }

function stripUnknownCapabilities(intent: CanonicalUiIntent, allowed: ReadonlySet<string>, unknown: string[]): CanonicalUiIntent {
  const visit = (node: CanonicalUiIntent['tree']): CanonicalUiIntent['tree'] => {
    const copy = { ...node, children: node.children.map(visit) };
    if (copy.capabilityId && !allowed.has(copy.capabilityId)) {
      unknown.push(copy.capabilityId);
      delete copy.capabilityId;
    }
    return copy;
  };
  return { ...intent, tree: visit(intent.tree) };
}
