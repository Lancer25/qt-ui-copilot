import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { UiPlan } from '@qt-ui-copilot/contracts';
import type { DesktopApi, ReportRequest, UiProject, WorkflowUiState } from '../lib/api';

const project: UiProject = { id: 'demo', rootDir: 'D:/demo', uiFiles: ['src/Settings.ui'] };

export class FakeDesktopApi implements DesktopApi {
  private plan?: UiPlan;
  private listeners = new Set<(state: WorkflowUiState) => void>();
  private state?: WorkflowUiState;
  public takeoverRequested = false;
  public exported?: ReportRequest;
  withPlan(plan: UiPlan): this { this.plan = plan; return this; }
  projects = { import: async (): Promise<UiProject> => project };
  tasks = {
    start: async ({ targetUi }: { projectId: string; targetUi: string; requirement: string }): Promise<WorkflowUiState> => this.publish({
      taskId: 'task-1', targetUi, status: 'waiting_approval', node: 'USER_APPROVAL', plan: this.plan,
      events: [{ node: 'GENERATE_UI_PLAN', status: 'completed' }], deterministicFindings: [], visualFindings: [], routeEvidence: [],
    }),
    approve: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'running', node: 'UIC_VALIDATE' })),
    cancel: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'cancelled', node: 'USER_APPROVAL' })),
    takeOver: async (): Promise<void> => { this.takeoverRequested = true; },
    accept: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'completed', node: 'ACCEPT_OR_ROLLBACK' })),
    rollback: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'cancelled', node: 'ACCEPT_OR_ROLLBACK' })),
  };
  components = { search: async (): Promise<ComponentCandidate[]> => [] };
  reports = { export: async (request: ReportRequest) => { this.exported = request; return { cancelled: false, path: 'D:/report.html' }; } };
  onWorkflowEvent(listener: (state: WorkflowUiState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private requireState(change: Partial<WorkflowUiState>): WorkflowUiState { if (!this.state) throw new Error('No task'); return { ...this.state, ...change }; }
  private publish(state: WorkflowUiState): WorkflowUiState { this.state = state; this.listeners.forEach((listener) => listener(state)); return state; }
}
