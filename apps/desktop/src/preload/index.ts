import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, ReportRequest, UiProject, WorkflowUiState } from '../renderer/lib/api';

const desktopApi: DesktopApi = {
  projects: { import: (input) => ipcRenderer.invoke('projects:import', input) as Promise<UiProject> },
  tasks: {
    start: (input) => ipcRenderer.invoke('tasks:start', input) as Promise<WorkflowUiState>, approve: (input) => ipcRenderer.invoke('tasks:approve', input) as Promise<WorkflowUiState>,
    cancel: (input) => ipcRenderer.invoke('tasks:cancel', input) as Promise<WorkflowUiState>, takeOver: (input) => ipcRenderer.invoke('tasks:takeOver', input) as Promise<void>,
    accept: (input) => ipcRenderer.invoke('tasks:accept', input) as Promise<WorkflowUiState>, rollback: (input) => ipcRenderer.invoke('tasks:rollback', input) as Promise<WorkflowUiState>,
  },
  components: { search: (input) => ipcRenderer.invoke('components:search', input) as ReturnType<DesktopApi['components']['search']> },
  reports: { export: (input: ReportRequest) => ipcRenderer.invoke('reports:export', input) as Promise<{ path?: string; cancelled: boolean }> },
  onWorkflowEvent: (listener) => { const handler = (_event: Electron.IpcRendererEvent, state: WorkflowUiState) => listener(state); ipcRenderer.on('workflow:event', handler); return () => ipcRenderer.removeListener('workflow:event', handler); },
};

contextBridge.exposeInMainWorld('qtUiCopilot', desktopApi);
