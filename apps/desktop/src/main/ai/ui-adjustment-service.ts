import { createHash } from 'node:crypto';
import type { VisualEnhancementOperation } from '@qt-ui-copilot/contracts';
import { applyEnhancement } from '@qt-ui-copilot/ui-document';
import { parseUi } from '@qt-ui-copilot/ui-document';
import { UiEnhancementPlanner, type UiEnhancementPlannerInput } from './ui-enhancement-planner.js';

export interface UiAdjustmentInput {
  uiFile: string;
  uiContent: string;
  requirement: string;
  previewDataUrl?: string;
  contextMode: 'focused_ui' | 'whole_project';
  signal?: AbortSignal;
}

export interface UiAdjustmentResult {
  source: string;
  operations: VisualEnhancementOperation[];
  beforeHash: string;
  afterHash: string;
  summary: string;
}

export interface UiAdjustmentServiceDependencies {
  planner: Pick<UiEnhancementPlanner, 'plan'>;
  /** Optional authoritative uic check. It is deliberately injected so this
   * service remains deterministic and easy to exercise without Qt installed. */
  validateUic?: (source: string, filePath: string, signal?: AbortSignal) => Promise<boolean>;
}

export class UiAdjustmentError extends Error {
  readonly source: string;
  readonly beforeHash: string;

  constructor(message: string, source: string) {
    super(message);
    this.name = 'UiAdjustmentError';
    this.source = source;
    this.beforeHash = sha256(source);
  }
}

/**
 * Applies a model-generated visual plan to a UI document without mutating the
 * project. The caller stages the returned source and performs build/preview
 * before committing it. Every failure therefore leaves the prior source
 * available through both the result/error and the caller's candidate store.
 */
export class UiAdjustmentService {
  private readonly planner: Pick<UiEnhancementPlanner, 'plan'>;
  private readonly validateUic?: UiAdjustmentServiceDependencies['validateUic'];

  constructor(dependencies: UiAdjustmentServiceDependencies | Pick<UiEnhancementPlanner, 'plan'>, validateUic?: UiAdjustmentServiceDependencies['validateUic']) {
    this.planner = 'planner' in dependencies ? dependencies.planner : dependencies;
    this.validateUic = 'planner' in dependencies ? dependencies.validateUic : validateUic;
  }

  async adjust(input: UiAdjustmentInput): Promise<UiAdjustmentResult> {
    const source = input.uiContent;
    const beforeHash = sha256(source);
    checkCancelled(input.signal);
    if (!input.requirement.trim()) throw new UiAdjustmentError('调整要求不能为空', source);

    let parsed;
    try { parsed = parseUi(source, input.uiFile); }
    catch (error) { throw new UiAdjustmentError(`当前 UI 无法解析：${messageOf(error)}`, source); }
    const objectNames = [...parsed.index.widgetsByName.keys(), ...parsed.index.layoutsByName.keys()];
    const plannerInput: UiEnhancementPlannerInput = {
      requirement: input.requirement,
      baseUi: source,
      objectNames,
      ...(input.previewDataUrl ? { referenceImage: { name: 'current-preview.png', mimeType: 'image/png', dataUrl: input.previewDataUrl } } : {}),
    };
    let plan;
    try { plan = await raceWithCancellation(this.planner.plan(plannerInput), input.signal, source); }
    catch (error) { checkCancelled(input.signal); throw new UiAdjustmentError(`AI 调整方案无效：${messageOf(error)}`, source); }
    checkCancelled(input.signal);

    let candidate = source;
    const applied: VisualEnhancementOperation[] = [];
    for (const operation of plan.operations) {
      checkCancelled(input.signal);
      const result = applyEnhancement(candidate, operation, input.uiFile);
      if (!result.applied) throw new UiAdjustmentError(result.warning?.message ?? `无法应用操作：${operation.op}`, source);
      candidate = result.source;
      applied.push(operation);
    }
    if (candidate === source) throw new UiAdjustmentError('AI 没有生成可应用的界面修改', source);
    try { parseUi(candidate, input.uiFile); }
    catch (error) { throw new UiAdjustmentError(`修改后的 UI 无法解析：${messageOf(error)}`, source); }
    if (this.validateUic) {
      checkCancelled(input.signal);
      let valid = false;
      try { valid = await this.validateUic(candidate, input.uiFile, input.signal); }
      catch (error) { checkCancelled(input.signal); throw new UiAdjustmentError(`uic 校验失败：${messageOf(error)}`, source); }
      if (!valid) throw new UiAdjustmentError('uic 校验失败：修改后的 UI 未通过校验', source);
    }
    checkCancelled(input.signal);
    return { source: candidate, operations: applied, beforeHash, afterHash: sha256(candidate), summary: summarize(applied) };
  }
}

function sha256(source: string): string { return createHash('sha256').update(source, 'utf8').digest('hex'); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function checkCancelled(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('调整已取消', 'AbortError'); }
async function raceWithCancellation<T>(work: Promise<T>, signal: AbortSignal | undefined, source: string): Promise<T> {
  if (!signal) return work;
  checkCancelled(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new UiAdjustmentError('调整已取消', source));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
function summarize(operations: VisualEnhancementOperation[]): string { return operations.length === 0 ? '未产生界面修改' : `已应用 ${operations.length} 项界面调整：${operations.map((operation) => operation.op).join('、')}`; }
