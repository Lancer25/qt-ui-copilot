import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { UiPlan } from '@qt-ui-copilot/contracts';

export type WorkflowUiStatus = 'running' | 'waiting_approval' | 'failed' | 'cancelled' | 'completed';

export interface UiProject {
  id: string;
  rootDir: string;
  uiFiles: string[];
  configurationRequired?: string;
}

export interface ProjectSummary extends UiProject {
  profilePath?: string;
  updatedAt?: number;
  health?: 'ready' | 'needs_configuration' | 'missing';
}

export interface TaskSummary {
  id: string;
  projectId: string;
  targetUi: string;
  createdAt: number;
  updatedAt: number;
  lastEvent?: { node: string; status: 'started' | 'completed' | 'failed' | 'cancelled'; at: number };
}

export interface WorkflowUiState {
  taskId: string;
  /** Main-process monotonic snapshot sequence used to discard late IPC events. */
  revision?: number;
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
  visualReviewStatus?: 'not_run' | 'passed' | 'unavailable' | 'failed';
  evidence?: string[];
  routeEvidence: string[];
  qtKit?: string;
  build?: { executable: string; args: string[]; exitCode?: number };
  failure?: { code: string; message: string };
}

export interface ReportRequest {
  task: WorkflowUiState;
  selectedComponent?: ComponentCandidate;
}

export interface ModelSettings {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  hasPersistentApiKey?: boolean;
  storageWarning?: string;
}

export interface ModelConnectionResult {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  warning?: string;
  elapsedMs: number;
  model: string;
}

export type ModelCapability = 'text' | 'json' | 'vision';
export interface ModelCapabilityResult {
  capability: ModelCapability;
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
  elapsedMs: number;
  model: string;
}

export interface QtKit {
  id: string;
  displayName: string;
  version: string;
  qtMajor: 5 | 6;
  rootDir: string;
  binDirectory: string;
  uic: string;
  rcc: string;
  qmake?: string;
  cmakePrefixPath?: string;
  compilerAbi?: string;
  architecture?: string;
}

export interface QtToolHealth { name: 'uic' | 'rcc' | 'qmake' | 'cmake'; ok: boolean; path: string; version?: string; message?: string; }
export interface QtKitHealth { ok: boolean; checkedAt: number; tools: QtToolHealth[]; previewHost: { ok: boolean; cacheKey?: string; message?: string }; }
export interface ProjectBinding { projectId: string; qtKitId: string; config: Record<string, unknown>; updatedAt?: number; }
export interface WindowControls { minimize(): void; toggleMaximize(): Promise<boolean>; close(): void; }

export type WorkspaceFileKind = 'ui' | 'qss' | 'qrc' | 'source' | 'header' | 'cmake' | 'font' | 'plugin' | 'other';
export interface WorkspaceFile {
  absolutePath: string;
  relativePath: string;
  kind: WorkspaceFileKind;
  size: number;
  modifiedAt: number;
  contentHash: string;
}
export interface WorkspaceSummary {
  id: string;
  rootDir: string;
  name: string;
  fileCount: number;
  lastOpenedAt: number;
  createdAt: number;
  updatedAt: number;
  files: WorkspaceFile[];
}
export type WorkspaceChange =
  | { type: 'created'; workspaceId: string; path: string; file: WorkspaceFile }
  | { type: 'changed'; workspaceId: string; path: string; file: WorkspaceFile; previousHash: string }
  | { type: 'deleted'; workspaceId: string; path: string; previousHash: string }
  | { type: 'renamed'; workspaceId: string; path: string; oldPath: string; file: WorkspaceFile; previousHash: string };

export type TaskStartResult =
  | { kind: 'started'; state: WorkflowUiState }
  | { kind: 'configuration_required'; message: string };

export interface DesktopApi {
  window?: WindowControls;
  workspace?: {
    open(input: { rootDir: string; ignorePatterns?: string[] }): Promise<WorkspaceSummary>;
    listFiles(workspaceId: string): Promise<WorkspaceFile[]>;
    onChange(listener: (change: WorkspaceChange) => void): () => void;
  };
  projects: {
    /** Opens the native directory chooser in the Main process. Undefined means the user cancelled. */
    chooseDirectory(): Promise<string | undefined>;
    import(input: { rootDir: string }): Promise<UiProject>;
    list(): Promise<ProjectSummary[]>;
  };
  tasks: {
    list(input?: { projectId?: string; status?: 'started' | 'completed' | 'failed' | 'cancelled' }): Promise<TaskSummary[]>;
    get(input: { taskId: string }): Promise<WorkflowUiState | undefined>;
    start(input: { projectId: string; targetUi: string; requirement: string }): Promise<TaskStartResult>;
    approve(input: { taskId: string; approved: boolean }): Promise<WorkflowUiState>;
    cancel(input: { taskId: string }): Promise<WorkflowUiState>;
    takeOver(input: { taskId: string }): Promise<void>;
    accept(input: { taskId: string }): Promise<WorkflowUiState>;
    rollback(input: { taskId: string }): Promise<WorkflowUiState>;
  };
  components: { search(input: { projectId: string; query: string }): Promise<ComponentCandidate[]> };
  reports: { export(input: ReportRequest): Promise<{ path?: string; cancelled: boolean }> };
  settings: {
    getModel(): Promise<ModelSettings>;
    configureModel(input: { baseUrl: string; model: string; apiKey?: string }): Promise<ModelSettings>;
    testModel(): Promise<ModelConnectionResult>;
    testModelCapability(input: { capability: ModelCapability }): Promise<ModelCapabilityResult>;
    qtKits?: {
      list(): Promise<QtKit[]>;
      scan(): Promise<QtKit[]>;
      check(kit: QtKit): Promise<QtKitHealth>;
      save(kit: QtKit): Promise<QtKit>;
      delete(id: string): Promise<void>;
    };
    getProjectBinding(projectId: string): Promise<ProjectBinding | undefined>;
    saveProjectBinding(input: ProjectBinding): Promise<ProjectBinding>;
    checkProjectBinding(input: ProjectBinding): Promise<{ ok: boolean; blocking: string[] }>;
  };
  onWorkflowEvent(listener: (state: WorkflowUiState) => void): () => void;
}

export const desktopApi = (): DesktopApi => window.qtUiCopilot;
