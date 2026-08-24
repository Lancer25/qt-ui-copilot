import type { RiskLevel } from '@qt-ui-copilot/contracts';
import type { TaskRepository } from '@qt-ui-copilot/task-store';
import { z } from 'zod';

export const WORKFLOW_NODES = [
  'IMPORT_PROJECT', 'SELECT_UI', 'CAPTURE_BASELINE', 'RETRIEVE_COMPONENTS', 'UNDERSTAND_REQUIREMENT', 'GENERATE_UI_PLAN',
  'USER_APPROVAL', 'APPLY_CANDIDATE_PATCH', 'XML_VALIDATE', 'UIC_VALIDATE', 'ENHANCED_PREVIEW', 'DETERMINISTIC_CHECKS',
  'VISUAL_REVIEW', 'OPTIONAL_REPAIR', 'INCREMENTAL_BUILD', 'LAUNCH_ISOLATED_EXE', 'NAVIGATE_TO_TARGET', 'PROBE_VERIFY_PAGE',
  'CAPTURE_REAL_RESULT', 'FINAL_CHECKS', 'REPORT', 'ACCEPT_OR_ROLLBACK',
] as const;
export type WorkflowNode = (typeof WORKFLOW_NODES)[number];
export type WorkflowStatus = 'running' | 'waiting_approval' | 'failed' | 'cancelled' | 'completed';

export interface WorkflowFailure { code: string; message: string; }
export interface WorkflowState {
  taskId: string;
  node: WorkflowNode;
  status: WorkflowStatus;
  riskLevel: RiskLevel;
  repairAttempts: number;
  requiredEvidence: readonly string[];
  evidence: readonly string[];
  failure?: WorkflowFailure;
}

export interface WorkflowRequest { taskId: string; riskLevel?: RiskLevel; }
export type WorkflowResult =
  | { kind: 'passed'; evidence?: readonly string[] }
  /** A completed node whose evidence is explicitly degraded (for example, a
   * visual provider was unavailable). It must never be treated as a pass by
   * consumers, but it may continue to deterministic/runtime verification. */
  | { kind: 'degraded'; evidence?: readonly string[] }
  | { kind: 'repair'; reason: string }
  | { kind: 'failed'; code: string; message: string };

export interface WorkflowStore {
  append(taskId: string, state: WorkflowState, event: 'started' | 'completed' | 'failed' | 'cancelled'): Promise<void> | void;
  load(taskId: string): Promise<WorkflowState | undefined> | WorkflowState | undefined;
}

const WorkflowStateSchema = z.object({
  taskId: z.string().min(1), node: z.enum(WORKFLOW_NODES),
  status: z.enum(['running', 'waiting_approval', 'failed', 'cancelled', 'completed']),
  riskLevel: z.enum(['low', 'medium', 'high']), repairAttempts: z.number().int().min(0),
  requiredEvidence: z.array(z.string().min(1)), evidence: z.array(z.string().min(1)),
  failure: z.object({ code: z.string().min(1), message: z.string().min(1) }).optional(),
}).strict();

/** Bridges the workflow machine to Task 2's SQLite event log. */
export class TaskRepositoryWorkflowStore implements WorkflowStore {
  constructor(private readonly repository: Pick<TaskRepository, 'appendEvent' | 'listEvents'>) {}
  append(taskId: string, state: WorkflowState, event: 'started' | 'completed' | 'failed' | 'cancelled'): void {
    this.repository.appendEvent(taskId, { node: state.node, status: event, at: Date.now(), payload: { workflowState: WorkflowStateSchema.parse(state) } });
  }
  load(taskId: string): WorkflowState | undefined {
    const events = this.repository.listEvents(taskId);
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const payload = events[index].payload;
      if (typeof payload !== 'object' || payload === null || !('workflowState' in payload)) continue;
      const result = WorkflowStateSchema.safeParse((payload as { workflowState: unknown }).workflowState);
      if (result.success) return result.data;
    }
    return undefined;
  }
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly entries = new Map<string, Array<{ state: WorkflowState; event: 'started' | 'completed' | 'failed' | 'cancelled' }>>();
  append(taskId: string, state: WorkflowState, event: 'started' | 'completed' | 'failed' | 'cancelled'): void {
    this.entries.set(taskId, [...(this.entries.get(taskId) ?? []), { state: structuredClone(state), event }]);
  }
  load(taskId: string): WorkflowState | undefined { return this.entries.get(taskId)?.at(-1)?.state && structuredClone(this.entries.get(taskId)!.at(-1)!.state); }
  events(taskId: string): readonly { state: WorkflowState; node: WorkflowNode; status: 'started' | 'completed' | 'failed' | 'cancelled' }[] {
    return (this.entries.get(taskId) ?? []).map(({ state, event }) => ({ state: structuredClone(state), node: state.node, status: event }));
  }
  seed(taskId: string, state: WorkflowState): void { this.append(taskId, state, 'started'); }
}

export interface WorkflowMachineDependencies {
  store: WorkflowStore;
  execute(node: WorkflowNode, state: Readonly<WorkflowState>): Promise<WorkflowResult>;
}

const initialRequiredEvidence = (risk: RiskLevel): readonly string[] => risk === 'low' ? ['baseline_capture', 'preview_capture'] : ['baseline_capture', 'preview_capture', 'real_application_capture'];
const nextNode = (node: WorkflowNode): WorkflowNode | undefined => WORKFLOW_NODES[WORKFLOW_NODES.indexOf(node) + 1];
const unsafeReplayNodes = new Set<WorkflowNode>(['APPLY_CANDIDATE_PATCH']);

/**
 * Persisted, explicit orchestration. Only this machine advances nodes; LLMs
 * cannot write files, waive deterministic evidence, or accept a candidate.
 */
export class WorkflowMachine {
  constructor(private readonly dependencies: WorkflowMachineDependencies) {}

  async start(request: WorkflowRequest): Promise<WorkflowState> {
    const existing = await this.dependencies.store.load(request.taskId);
    if (existing) throw new Error(`Workflow task already exists: ${request.taskId}`);
    const riskLevel = request.riskLevel ?? 'medium';
    const state: WorkflowState = {
      taskId: request.taskId, node: 'IMPORT_PROJECT', status: 'running', riskLevel, repairAttempts: 0,
      requiredEvidence: initialRequiredEvidence(riskLevel), evidence: [],
    };
    await this.persist(state, 'started');
    return this.advance(state);
  }

  async approve(taskId: string, approval: { approved: boolean }): Promise<WorkflowState> {
    const state = await this.requireState(taskId);
    if (state.status !== 'waiting_approval') throw new Error(`Workflow ${taskId} is not waiting for approval`);
    if (!approval.approved) return this.finish({ ...state, status: 'cancelled' }, 'cancelled');
    if (state.node === 'USER_APPROVAL') return this.advance({ ...state, node: 'APPLY_CANDIDATE_PATCH', status: 'running' });
    if (state.node === 'ACCEPT_OR_ROLLBACK') {
      const accepting = { ...state, status: 'running' as const };
      await this.persist(accepting, 'started');
      let result: WorkflowResult;
      try { result = await this.dependencies.execute('ACCEPT_OR_ROLLBACK', accepting); }
      catch (error) { return this.fail(accepting, 'workflow_step_exception', error instanceof Error ? error.message : String(error)); }
      if (result.kind === 'failed') return this.fail(accepting, result.code, result.message);
      if (result.kind === 'repair') return this.fail(accepting, 'acceptance_repair_invalid', 'Acceptance cannot request another repair');
      return this.finish({ ...accepting, status: 'completed', evidence: [...new Set([...accepting.evidence, ...(result.evidence ?? [])])] }, 'completed');
    }
    throw new Error(`Approval is not allowed at ${state.node}`);
  }

  async cancel(taskId: string): Promise<WorkflowState> {
    const state = await this.requireState(taskId);
    if (state.status === 'completed') throw new Error('Cannot cancel an accepted workflow');
    return this.finish({ ...state, status: 'cancelled' }, 'cancelled');
  }

  async resume(taskId: string): Promise<WorkflowState> {
    const state = await this.requireState(taskId);
    if (state.status !== 'running') return state;
    // A process may have died between the durable "started" event and the
    // atomic candidate write. Replaying that write is unsafe and forbidden.
    if (unsafeReplayNodes.has(state.node)) return this.fail(state, 'manual_recovery_required', 'Candidate patch may have been written before the previous process stopped');
    return this.advance(state);
  }

  private async advance(initial: WorkflowState): Promise<WorkflowState> {
    let state = initial;
    while (state.status === 'running') {
      if (state.node === 'USER_APPROVAL' || state.node === 'ACCEPT_OR_ROLLBACK') {
        state = { ...state, status: 'waiting_approval' };
        await this.persist(state, 'completed');
        return state;
      }
      if (state.node === 'OPTIONAL_REPAIR') {
        if (state.repairAttempts >= 2) return this.fail(state, 'repair_attempts_exhausted', 'The UI did not pass validation after two repair attempts');
        state = { ...state, node: 'GENERATE_UI_PLAN', repairAttempts: state.repairAttempts + 1 };
        await this.persist(state, 'completed');
        continue;
      }
      await this.persist(state, 'started');
      let result: WorkflowResult;
      try { result = await this.dependencies.execute(state.node, state); }
      catch (error) { return this.fail(state, 'workflow_step_exception', error instanceof Error ? error.message : String(error)); }
      if (result.kind === 'failed') return this.fail(state, result.code, result.message);
      if (result.kind === 'repair') {
        state = { ...state, node: 'OPTIONAL_REPAIR', evidence: [...state.evidence] };
        await this.persist(state, 'completed');
        continue;
      }
      const evidence = [...new Set([...state.evidence, ...(result.evidence ?? [])])];
      if (state.node === 'FINAL_CHECKS') {
        const missing = state.requiredEvidence.filter((item) => !evidence.includes(item));
        if (missing.length) return this.fail({ ...state, evidence }, 'evidence_missing', `Missing required evidence: ${missing.join(', ')}`);
      }
      // OPTIONAL_REPAIR is a branch, not an unconditional node. A successful
      // visual review continues to the real-application validation path.
      const next = state.node === 'VISUAL_REVIEW' ? 'INCREMENTAL_BUILD' : nextNode(state.node);
      if (!next) return this.fail({ ...state, evidence }, 'workflow_definition_invalid', `No node follows ${state.node}`);
      state = { ...state, node: next, evidence };
      await this.persist(state, 'completed');
    }
    return state;
  }

  private async requireState(taskId: string): Promise<WorkflowState> {
    const state = await this.dependencies.store.load(taskId);
    if (!state) throw new Error(`Workflow task does not exist: ${taskId}`);
    return state;
  }
  private async persist(state: WorkflowState, event: 'started' | 'completed' | 'failed' | 'cancelled'): Promise<void> { await this.dependencies.store.append(state.taskId, state, event); }
  private async fail(state: WorkflowState, code: string, message: string): Promise<WorkflowState> { return this.finish({ ...state, status: 'failed', failure: { code, message } }, 'failed'); }
  private async finish(state: WorkflowState, event: 'failed' | 'cancelled' | 'completed'): Promise<WorkflowState> { await this.persist(state, event); return state; }
}
