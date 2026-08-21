import { describe, expect, it } from 'vitest';
import { openDatabase, TaskRepository } from '@qt-ui-copilot/task-store';
import { InMemoryWorkflowStore, TaskRepositoryWorkflowStore, WorkflowMachine, type WorkflowNode } from '../src/index.js';

const automaticNodes = new Set<WorkflowNode>([
  'IMPORT_PROJECT', 'SELECT_UI', 'CAPTURE_BASELINE', 'RETRIEVE_COMPONENTS', 'UNDERSTAND_REQUIREMENT', 'GENERATE_UI_PLAN',
  'APPLY_CANDIDATE_PATCH', 'XML_VALIDATE', 'UIC_VALIDATE', 'ENHANCED_PREVIEW', 'DETERMINISTIC_CHECKS', 'VISUAL_REVIEW',
  'INCREMENTAL_BUILD', 'LAUNCH_ISOLATED_EXE', 'NAVIGATE_TO_TARGET', 'PROBE_VERIFY_PAGE', 'CAPTURE_REAL_RESULT', 'FINAL_CHECKS', 'REPORT', 'ACCEPT_OR_ROLLBACK',
]);

function machine(store = new InMemoryWorkflowStore(), results: Partial<Record<WorkflowNode, 'passed' | 'repair' | 'failed'>> = {}, omitEvidence = false) {
  return new WorkflowMachine({ store, execute: async (node) => {
    if (!automaticNodes.has(node)) throw new Error(`unexpected ${node}`);
    const outcome = results[node] ?? 'passed';
    if (outcome === 'failed') return { kind: 'failed', code: `${node}_failed`, message: 'simulated failure' };
    if (outcome === 'repair') return { kind: 'repair', reason: 'simulated issue' };
    return { kind: 'passed', evidence: omitEvidence ? [] : [
      ...(node === 'CAPTURE_BASELINE' ? ['baseline_capture'] : []),
      ...(node === 'ENHANCED_PREVIEW' ? ['preview_capture'] : []),
      ...(node === 'CAPTURE_REAL_RESULT' ? ['real_application_capture'] : []),
    ] };
  }});
}

describe('WorkflowMachine', () => {
  it('cannot reach ACCEPT without real-runtime evidence for medium risk', async () => {
    const subject = machine(undefined, {}, true);
    const initial = await subject.start({ taskId: 'medium', riskLevel: 'medium' });
    const state = await subject.approve('medium', { approved: true });
    expect(initial.node).toBe('USER_APPROVAL');
    expect(state.node).not.toBe('ACCEPT_OR_ROLLBACK');
    expect(state.failure?.code).toBe('evidence_missing');
    expect(state.requiredEvidence).toContain('real_application_capture');
    expect(state.status).toBe('failed');
  });

  it('requires explicit plan and final acceptance approvals and persists transitions', async () => {
    const store = new InMemoryWorkflowStore(); const subject = machine(store);
    await subject.start({ taskId: 'success', riskLevel: 'medium' });
    const afterPlan = await subject.approve('success', { approved: true });
    expect(afterPlan.node).toBe('ACCEPT_OR_ROLLBACK');
    expect(afterPlan.status).toBe('waiting_approval');
    const done = await subject.approve('success', { approved: true });
    expect(done.status).toBe('completed');
    expect(store.events('success').some((event) => event.node === 'APPLY_CANDIDATE_PATCH' && event.status === 'started')).toBe(true);
    expect(store.events('success').some((event) => event.node === 'ACCEPT_OR_ROLLBACK' && event.status === 'started')).toBe(true);
  });

  it('fails on uic, preview and route evidence without accepting', async () => {
    for (const node of ['UIC_VALIDATE', 'ENHANCED_PREVIEW', 'NAVIGATE_TO_TARGET'] as const) {
      const subject = machine(undefined, { [node]: 'failed' });
      await subject.start({ taskId: node, riskLevel: 'low' });
      const state = await subject.approve(node, { approved: true });
      expect(state.status).toBe('failed');
      expect(state.node).not.toBe('ACCEPT_OR_ROLLBACK');
    }
  });

  it('allows at most two visual-ambiguity repair attempts', async () => {
    const store = new InMemoryWorkflowStore(); const subject = machine(store, { VISUAL_REVIEW: 'repair' });
    await subject.start({ taskId: 'repair', riskLevel: 'low' });
    await subject.approve('repair', { approved: true });
    await subject.approve('repair', { approved: true });
    const final = await subject.approve('repair', { approved: true });
    expect(final.status).toBe('failed');
    expect(final.failure?.code).toBe('repair_attempts_exhausted');
  });

  it('persists cancellation from a user approval gate', async () => {
    const store = new InMemoryWorkflowStore(); const subject = machine(store);
    await subject.start({ taskId: 'cancel', riskLevel: 'low' });
    const cancelled = await subject.cancel('cancel');
    expect(cancelled.status).toBe('cancelled');
    expect(store.events('cancel').at(-1)?.status).toBe('cancelled');
  });

  it('does not replay a persisted candidate write after a crash', async () => {
    const store = new InMemoryWorkflowStore();
    store.seed('crash', { taskId: 'crash', node: 'APPLY_CANDIDATE_PATCH', status: 'running', riskLevel: 'low', repairAttempts: 0, requiredEvidence: [], evidence: [] });
    const state = await machine(store).resume('crash');
    expect(state.status).toBe('failed');
    expect(state.failure?.code).toBe('manual_recovery_required');
  });

  it('restores explicit state snapshots from the SQLite event log', async () => {
    const database = openDatabase(':memory:');
    const repo = new TaskRepository(database);
    const taskId = repo.createTask('workflow-project', 'ui/Settings.ui');
    const store = new TaskRepositoryWorkflowStore(repo);
    const subject = machine(store);
    const initial = await subject.start({ taskId, riskLevel: 'low' });
    expect(initial.status).toBe('waiting_approval');
    expect(store.load(taskId)).toMatchObject({ node: 'USER_APPROVAL', status: 'waiting_approval' });
    database.close();
  });
});
