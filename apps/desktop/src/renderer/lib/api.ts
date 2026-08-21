import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { UiPlan } from '@qt-ui-copilot/contracts';

export type WorkflowUiStatus = 'running' | 'waiting_approval' | 'failed' | 'cancelled' | 'completed';

export interface UiProject {
  id: string;
  rootDir: string;
  uiFiles: string[];
}

export interface WorkflowUiState {
  taskId: string;
  targetUi: string;
  status: WorkflowUiStatus;
  node: string;
  plan?: UiPlan;
  events: Array<{ node: string; status: string; detail?: string }>;
  beforeImage?: string;
  afterImage?: string;
  quickImage?: string;
  xmlBefore?: string;
  xmlAfter?: string;
  deterministicFindings: string[];
  visualFindings: string[];
  routeEvidence: string[];
  qtKit?: string;
  build?: { executable: string; args: string[]; exitCode?: number };
}

export interface ReportRequest {
  task: WorkflowUiState;
  selectedComponent?: ComponentCandidate;
}

export interface DesktopApi {
  projects: { import(input: { rootDir: string }): Promise<UiProject> };
  tasks: {
    start(input: { projectId: string; targetUi: string; requirement: string }): Promise<WorkflowUiState>;
    approve(input: { taskId: string; approved: boolean }): Promise<WorkflowUiState>;
    cancel(input: { taskId: string }): Promise<WorkflowUiState>;
    takeOver(input: { taskId: string }): Promise<void>;
    accept(input: { taskId: string }): Promise<WorkflowUiState>;
    rollback(input: { taskId: string }): Promise<WorkflowUiState>;
  };
  components: { search(input: { projectId: string; query: string }): Promise<ComponentCandidate[]> };
  reports: { export(input: ReportRequest): Promise<{ path?: string; cancelled: boolean }> };
  onWorkflowEvent(listener: (state: WorkflowUiState) => void): () => void;
}

export const desktopApi = (): DesktopApi => window.qtUiCopilot;
