export type SettingsSection =
  | 'model'
  | 'qt-kits'
  | 'build-tools'
  | 'project-binding'
  | 'preview'
  | 'navigation'
  | 'component-sources'
  | 'appearance'
  | 'data-safety';

export type AppTab =
  | { id: 'workbench'; kind: 'workbench'; title: string; closable: false }
  | { id: 'settings'; kind: 'settings'; title: string; closable: true; section?: SettingsSection }
  | { id: `ui:${string}`; kind: 'ui'; title: string; closable: true; projectId: string; uiFile: string }
  | { id: `task:${string}`; kind: 'task'; title: string; closable: true; taskId: string }
  | { id: `report:${string}`; kind: 'report'; title: string; closable: true; taskId: string };

export interface TabState {
  tabs: AppTab[];
  activeId: AppTab['id'];
}

export const workbenchTab: AppTab = { id: 'workbench', kind: 'workbench', title: 'AI 工作台', closable: false };
export const initialTabState: TabState = { tabs: [workbenchTab], activeId: workbenchTab.id };

export function openTab(state: TabState, tab: AppTab): TabState {
  const existing = state.tabs.findIndex((candidate) => candidate.id === tab.id);
  if (existing >= 0) {
    return { tabs: state.tabs, activeId: state.tabs[existing].id };
  }
  return { tabs: [...state.tabs, tab], activeId: tab.id };
}

export function closeTab(state: TabState, id: AppTab['id']): TabState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tab = state.tabs[index];
  if (!tab.closable) return { tabs: state.tabs, activeId: tab.id };
  const tabs = state.tabs.filter((candidate) => candidate.id !== id);
  if (state.activeId !== id) return { tabs, activeId: state.activeId };
  const next = tabs[Math.min(index, tabs.length - 1)] ?? workbenchTab;
  return { tabs, activeId: next.id };
}

export function activateTab(state: TabState, id: AppTab['id']): TabState {
  return state.tabs.some((tab) => tab.id === id) ? { ...state, activeId: id } : state;
}

const isSettingsSection = (value: unknown): value is SettingsSection =>
  ['model', 'qt-kits', 'build-tools', 'project-binding', 'preview', 'navigation', 'component-sources', 'appearance', 'data-safety'].includes(String(value));

function parseTab(raw: unknown): AppTab | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  if (value.id === 'workbench') return workbenchTab;
  if (value.id === 'settings' && typeof value.title === 'string') {
    return { id: 'settings', kind: 'settings', title: value.title, closable: true, ...(isSettingsSection(value.section) ? { section: value.section } : {}) };
  }
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || value.closable !== true) return undefined;
  if (value.kind === 'ui' && value.id.startsWith('ui:') && typeof value.projectId === 'string' && typeof value.uiFile === 'string') {
    return { id: value.id as `ui:${string}`, kind: 'ui', title: value.title, closable: true, projectId: value.projectId, uiFile: value.uiFile };
  }
  if (value.kind === 'task' && value.id.startsWith('task:') && typeof value.taskId === 'string') {
    return { id: value.id as `task:${string}`, kind: 'task', title: value.title, closable: true, taskId: value.taskId };
  }
  if (value.kind === 'report' && value.id.startsWith('report:') && typeof value.taskId === 'string') {
    return { id: value.id as `report:${string}`, kind: 'report', title: value.title, closable: true, taskId: value.taskId };
  }
  return undefined;
}

export function restoreTabs(raw: unknown): TabState {
  let input: unknown = raw;
  if (typeof raw === 'string') {
    try { input = JSON.parse(raw); } catch { return initialTabState; }
  }
  if (!input || typeof input !== 'object') return initialTabState;
  const record = input as Record<string, unknown>;
  const parsed = Array.isArray(record.tabs) ? record.tabs.map(parseTab).filter((tab): tab is AppTab => Boolean(tab)) : [];
  // Settings is an ephemeral navigation view, not a document/resource tab.
  // Never resurrect it from a previous session when the user did not open it.
  const tabs = [workbenchTab, ...parsed.filter((tab) => tab.id !== workbenchTab.id && tab.kind !== 'settings')];
  const requested = typeof record.activeId === 'string' ? record.activeId : workbenchTab.id;
  const activeId = tabs.some((tab) => tab.id === requested) ? requested as AppTab['id'] : workbenchTab.id;
  return { tabs, activeId };
}

export const serializeTabs = (state: TabState): string => JSON.stringify(state);
