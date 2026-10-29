export type ArtifactTab =
  | { id: string; kind: 'task'; taskId: string; title: string }
  | { id: string; kind: 'settings'; title: string }
  | { id: string; kind: 'preview'; filePath: string; title: string; temporary: boolean; candidateId?: string }
  | { id: string; kind: 'source' | 'diff' | 'output'; filePath?: string; taskId?: string; title: string };

export interface ArtifactTabsState {
  tabs: ArtifactTab[];
  activeTabId?: string;
}

export type ArtifactTabsAction =
  | { type: 'openTask'; taskId: string; title: string }
  | { type: 'openSettings' }
  | { type: 'openPreview'; filePath: string; title?: string; temporary: boolean; candidateId?: string }
  | { type: 'openArtifact'; kind: 'source' | 'diff' | 'output'; title: string; filePath?: string; taskId?: string }
  | { type: 'activate'; id: string }
  | { type: 'reset' }
  | { type: 'close'; id: string };

const leafName = (filePath: string): string => filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
const identityForArtifact = (filePath?: string, taskId?: string): string => filePath ?? taskId ?? 'default';
const normalizedFileIdentity = (value: string): string => value.replaceAll('\\', '/').toLowerCase();

/** Stable IDs make duplicate opens idempotent on case-insensitive filesystems. */
export const artifactTabId = (kind: ArtifactTab['kind'], identity: string): string => {
  const normalizedIdentity = kind === 'preview' || kind === 'source' || kind === 'diff'
    ? normalizedFileIdentity(identity)
    : identity;
  return `${kind}:${normalizedIdentity}`;
};

export const initialArtifactTabsState: ArtifactTabsState = {
  tabs: [{ id: artifactTabId('task', 'default'), kind: 'task', taskId: 'default', title: 'AI 任务' }],
  activeTabId: artifactTabId('task', 'default'),
};

const openTab = (state: ArtifactTabsState, tab: ArtifactTab, update?: (existing: ArtifactTab) => ArtifactTab): ArtifactTabsState => {
  const existing = state.tabs.find((item) => item.id === tab.id);
  if (!existing) return { tabs: [...state.tabs, tab], activeTabId: tab.id };
  return { ...state, tabs: update ? state.tabs.map((item) => item.id === tab.id ? update(item) : item) : state.tabs, activeTabId: tab.id };
};

export function artifactTabsReducer(state: ArtifactTabsState, action: ArtifactTabsAction): ArtifactTabsState {
  if (action.type === 'openTask') {
    const tab: ArtifactTab = { id: artifactTabId('task', action.taskId), kind: 'task', taskId: action.taskId, title: action.title };
    return openTab(state, tab);
  }
  if (action.type === 'openSettings') {
    return openTab(state, { id: artifactTabId('settings', 'app'), kind: 'settings', title: '设置' });
  }
  if (action.type === 'openPreview') {
    const tab: ArtifactTab = {
      id: artifactTabId('preview', action.filePath), kind: 'preview', filePath: action.filePath,
      title: action.title ?? leafName(action.filePath), temporary: action.temporary, candidateId: action.candidateId,
    };
    return openTab(state, tab, (existing) => existing.kind === 'preview'
      ? { ...existing, temporary: action.temporary, candidateId: action.candidateId ?? existing.candidateId }
      : existing);
  }
  if (action.type === 'openArtifact') {
    const identity = identityForArtifact(action.filePath, action.taskId);
    const tab: ArtifactTab = {
      id: artifactTabId(action.kind, identity), kind: action.kind, title: action.title,
      ...(action.filePath ? { filePath: action.filePath } : {}), ...(action.taskId ? { taskId: action.taskId } : {}),
    };
    return openTab(state, tab);
  }
  if (action.type === 'activate') return state.tabs.some((tab) => tab.id === action.id) ? { ...state, activeTabId: action.id } : state;
  if (action.type === 'reset') return initialArtifactTabsState;
  const tabs = state.tabs.filter((tab) => tab.id !== action.id);
  return { tabs, activeTabId: state.activeTabId === action.id ? tabs.at(-1)?.id : state.activeTabId };
}
