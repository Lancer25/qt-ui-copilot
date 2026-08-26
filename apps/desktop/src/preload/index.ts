import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, ModelSettings, ReportRequest, TaskStartResult, UiProject, WorkflowUiState, WorkspaceChange } from '../renderer/lib/api';

const desktopApi: DesktopApi = {
  window: {
    minimize: () => { void ipcRenderer.invoke('window:minimize'); },
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
    close: () => { void ipcRenderer.invoke('window:close'); },
  },
  workspace: {
    open: (input) => ipcRenderer.invoke('v3.workspace.open', input) as ReturnType<NonNullable<DesktopApi['workspace']>['open']>,
    listFiles: (workspaceId) => ipcRenderer.invoke('v3.workspace.listFiles', { workspaceId }) as ReturnType<NonNullable<DesktopApi['workspace']>['listFiles']>,
    readText: (workspaceId, filePath) => ipcRenderer.invoke('v3.workspace.readText', { workspaceId, filePath }) as ReturnType<NonNullable<DesktopApi['workspace']>['readText']>,
    writeText: (workspaceId, filePath, content) => ipcRenderer.invoke('v3.workspace.writeText', { workspaceId, filePath, content }) as ReturnType<NonNullable<DesktopApi['workspace']>['writeText']>,
    onChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, change: WorkspaceChange) => listener(change);
      ipcRenderer.on('v3.workspace.onChange', handler);
      return () => ipcRenderer.removeListener('v3.workspace.onChange', handler);
    },
    tree: (input) => ipcRenderer.invoke('v3.workspace.tree', input) as ReturnType<NonNullable<DesktopApi['workspace']>['tree']>,
    createFile: (input) => ipcRenderer.invoke('v3.workspace.createFile', input) as ReturnType<NonNullable<DesktopApi['workspace']>['createFile']>,
    createDirectory: (input) => ipcRenderer.invoke('v3.workspace.createDirectory', input) as ReturnType<NonNullable<DesktopApi['workspace']>['createDirectory']>,
    renameEntry: (input) => ipcRenderer.invoke('v3.workspace.renameEntry', input) as ReturnType<NonNullable<DesktopApi['workspace']>['renameEntry']>,
    trashEntry: (input) => ipcRenderer.invoke('v3.workspace.trashEntry', input) as ReturnType<NonNullable<DesktopApi['workspace']>['trashEntry']>,
    deleteEntryPermanently: (input) => ipcRenderer.invoke('v3.workspace.deleteEntryPermanently', input) as ReturnType<NonNullable<DesktopApi['workspace']>['deleteEntryPermanently']>,
  },
  capabilities: { search: (input) => ipcRenderer.invoke('v3.capabilities.search', input) as ReturnType<NonNullable<DesktopApi['capabilities']>['search']> },
  preview: { render: (input) => ipcRenderer.invoke('v3.preview.render', input) as ReturnType<NonNullable<DesktopApi['preview']>['render']>, cancel: (uiFile) => ipcRenderer.invoke('v3.preview.cancel', { uiFile }) as ReturnType<NonNullable<DesktopApi['preview']>['cancel']> },
  ai: {
    plan: (input) => ipcRenderer.invoke('v3.ai.plan', input) as ReturnType<NonNullable<DesktopApi['ai']>['plan']>,
    planStream: (input) => ipcRenderer.invoke('v3.ai.planStream', input) as ReturnType<NonNullable<DesktopApi['ai']>['planStream']>,
    createUiCandidate: (input) => ipcRenderer.invoke('v3.ai.createUiCandidate', input) as ReturnType<NonNullable<DesktopApi['ai']>['createUiCandidate']>,
    onCreationProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
      ipcRenderer.on('v3.ai.creationProgress', handler);
      return () => ipcRenderer.removeListener('v3.ai.creationProgress', handler);
    },
    commitUiCandidate: (candidateId) => ipcRenderer.invoke('v3.ai.commitUiCandidate', { candidateId }) as ReturnType<NonNullable<DesktopApi['ai']>['commitUiCandidate']>,
    rejectUiCandidate: (candidateId) => ipcRenderer.invoke('v3.ai.rejectUiCandidate', { candidateId }) as ReturnType<NonNullable<DesktopApi['ai']>['rejectUiCandidate']>,
    cancelUiCreation: (taskId) => ipcRenderer.invoke('v3.ai.cancelUiCreation', { taskId }) as ReturnType<NonNullable<DesktopApi['ai']>['cancelUiCreation']>,
  },
  revisions: { apply: (input) => ipcRenderer.invoke('v3.revision.apply', input) as ReturnType<NonNullable<DesktopApi['revisions']>['apply']>, undo: (uiFile) => ipcRenderer.invoke('v3.revision.undo', { uiFile }) as ReturnType<NonNullable<DesktopApi['revisions']>['undo']>, redo: (uiFile) => ipcRenderer.invoke('v3.revision.redo', { uiFile }) as ReturnType<NonNullable<DesktopApi['revisions']>['redo']>, rebase: (uiFile) => ipcRenderer.invoke('v3.revision.rebase', { uiFile }) as ReturnType<NonNullable<DesktopApi['revisions']>['rebase']> },
  projects: {
    chooseDirectory: () => ipcRenderer.invoke('projects:chooseDirectory') as Promise<string | undefined>,
    import: (input) => ipcRenderer.invoke('projects:import', input) as Promise<UiProject>,
    list: () => ipcRenderer.invoke('projects:list') as ReturnType<DesktopApi['projects']['list']>,
  },
  tasks: {
    list: (input) => ipcRenderer.invoke('tasks:list', input) as ReturnType<DesktopApi['tasks']['list']>,
    get: (input) => ipcRenderer.invoke('tasks:get', input) as ReturnType<DesktopApi['tasks']['get']>,
    start: (input) => ipcRenderer.invoke('tasks:start', input) as Promise<TaskStartResult>, approve: (input) => ipcRenderer.invoke('tasks:approve', input) as Promise<WorkflowUiState>,
    cancel: (input) => ipcRenderer.invoke('tasks:cancel', input) as Promise<WorkflowUiState>, takeOver: (input) => ipcRenderer.invoke('tasks:takeOver', input) as Promise<void>,
    accept: (input) => ipcRenderer.invoke('tasks:accept', input) as Promise<WorkflowUiState>, rollback: (input) => ipcRenderer.invoke('tasks:rollback', input) as Promise<WorkflowUiState>,
  },
  components: { search: (input) => ipcRenderer.invoke('components:search', input) as ReturnType<DesktopApi['components']['search']> },
  reports: { export: (input: ReportRequest) => ipcRenderer.invoke('reports:export', input) as Promise<{ path?: string; cancelled: boolean }> },
  settings: {
    getModel: () => ipcRenderer.invoke('settings:getModel') as Promise<ModelSettings>,
    configureModel: (input) => ipcRenderer.invoke('settings:configureModel', input) as Promise<ModelSettings>,
    testModel: () => ipcRenderer.invoke('settings:testModel', undefined) as Promise<import('../renderer/lib/api').ModelConnectionResult>,
    testModelCapability: (input) => ipcRenderer.invoke('settings:testModelCapability', input) as Promise<import('../renderer/lib/api').ModelCapabilityResult>,
    qtKits: {
      list: () => ipcRenderer.invoke('settings:qtKits:list') as ReturnType<NonNullable<DesktopApi['settings']['qtKits']>['list']>,
      scan: () => ipcRenderer.invoke('settings:qtKits:scan') as ReturnType<NonNullable<DesktopApi['settings']['qtKits']>['scan']>,
      check: (kit) => ipcRenderer.invoke('settings:qtKits:check', kit) as ReturnType<NonNullable<DesktopApi['settings']['qtKits']>['check']>,
      save: (kit) => ipcRenderer.invoke('settings:qtKits:save', kit) as ReturnType<NonNullable<DesktopApi['settings']['qtKits']>['save']>,
      delete: (id) => ipcRenderer.invoke('settings:qtKits:delete', { id }) as ReturnType<NonNullable<DesktopApi['settings']['qtKits']>['delete']>,
    },
    getProjectBinding: (projectId) => ipcRenderer.invoke('settings:projectBinding:get', { projectId }) as ReturnType<DesktopApi['settings']['getProjectBinding']>,
    saveProjectBinding: (input) => ipcRenderer.invoke('settings:projectBinding:save', input) as ReturnType<DesktopApi['settings']['saveProjectBinding']>,
    checkProjectBinding: (input) => ipcRenderer.invoke('settings:projectBinding:check', input) as ReturnType<DesktopApi['settings']['checkProjectBinding']>,
  },
  onWorkflowEvent: (listener) => { const handler = (_event: Electron.IpcRendererEvent, state: WorkflowUiState) => listener(state); ipcRenderer.on('workflow:event', handler); return () => ipcRenderer.removeListener('workflow:event', handler); },
};

contextBridge.exposeInMainWorld('qtUiCopilot', desktopApi);
