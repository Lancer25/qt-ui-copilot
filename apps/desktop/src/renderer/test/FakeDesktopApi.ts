import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { UiPlan } from '@qt-ui-copilot/contracts';
import type { DesktopApi, ModelConnectionResult, ModelSettings, ReportRequest, UiProject, WorkflowUiState } from '../lib/api';

const project: UiProject = { id: 'demo', rootDir: 'D:/demo', uiFiles: ['src/Settings.ui'] };

export class FakeDesktopApi implements DesktopApi {
  private plan?: UiPlan;
  private workflowFailure?: { code: string; message: string };
  private listeners = new Set<(state: WorkflowUiState) => void>();
  private state?: WorkflowUiState;
  public takeoverRequested = false;
  public approveRequests: Array<{ taskId: string; approved: boolean }> = [];
  public exported?: ReportRequest;
  public selectedDirectory: string | undefined = 'D:/demo';
  public importedDirectories: string[] = [];
  withPlan(plan: UiPlan): this { this.plan = plan; return this; }
  withWorkflowState(state: Pick<WorkflowUiState, 'status' | 'node'>): this { this.initialStatus = state.status; this.initialNode = state.node; return this; }
  withFailure(failure: { code: string; message: string }): this { this.workflowFailure = failure; return this; }
  private initialStatus: WorkflowUiState['status'] = 'waiting_approval';
  private initialNode: WorkflowUiState['node'] = 'USER_APPROVAL';
  projects = {
    chooseDirectory: async (): Promise<string | undefined> => this.selectedDirectory,
    import: async ({ rootDir }: { rootDir: string }): Promise<UiProject> => {
      this.importedDirectories.push(rootDir);
      return { ...project, rootDir };
    },
  };
  tasks = {
    start: async ({ targetUi }: { projectId: string; targetUi: string; requirement: string }) => ({ kind: 'started' as const, state: this.publish({
      taskId: 'task-1', targetUi,
      status: this.workflowFailure ? 'failed' : this.initialStatus,
      node: this.workflowFailure ? 'GENERATE_UI_PLAN' : this.initialNode,
      plan: this.plan,
      events: [{ node: 'GENERATE_UI_PLAN', status: this.workflowFailure ? 'failed' : 'completed', ...(this.workflowFailure ? { detail: this.workflowFailure.message } : {}) }],
      deterministicFindings: [], visualFindings: [], routeEvidence: [],
      ...(this.workflowFailure ? { failure: this.workflowFailure } : {}),
    }) }),
    approve: async (input: { taskId: string; approved: boolean }): Promise<WorkflowUiState> => {
      this.approveRequests.push(input);
      return this.publish(this.requireState({ status: 'running', node: 'UIC_VALIDATE' }));
    },
    cancel: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'cancelled', node: 'USER_APPROVAL' })),
    takeOver: async (): Promise<void> => { this.takeoverRequested = true; },
    accept: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'completed', node: 'ACCEPT_OR_ROLLBACK' })),
    rollback: async (): Promise<WorkflowUiState> => this.publish(this.requireState({ status: 'cancelled', node: 'ACCEPT_OR_ROLLBACK' })),
  };
  components = { search: async (): Promise<ComponentCandidate[]> => [] };
  reports = { export: async (request: ReportRequest) => { this.exported = request; return { cancelled: false, path: 'D:/report.html' }; } };
  settings = { getModel: async (): Promise<ModelSettings> => ({ baseUrl: 'http://localhost:11434/v1', model: 'fake', hasApiKey: false }), configureModel: async ({ baseUrl, model, apiKey }: { baseUrl: string; model: string; apiKey?: string }): Promise<ModelSettings> => ({ baseUrl, model, hasApiKey: Boolean(apiKey) }), testModel: async (): Promise<ModelConnectionResult> => ({ ok: true, status: 200, elapsedMs: 1, model: 'fake' }) };
  onWorkflowEvent(listener: (state: WorkflowUiState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private requireState(change: Partial<WorkflowUiState>): WorkflowUiState { if (!this.state) throw new Error('No task'); return { ...this.state, ...change }; }
  private publish(state: WorkflowUiState): WorkflowUiState { this.state = state; this.listeners.forEach((listener) => listener(state)); return state; }
}
