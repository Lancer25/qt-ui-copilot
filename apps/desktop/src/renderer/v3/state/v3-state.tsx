import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { WorkspaceFile, WorkspaceSummary } from '../../lib/api';

export interface V3Editor { id: string; filePath: string; title: string; preview: 'quick' | 'enhanced'; dirty: boolean; }
export interface V3State { workspace?: WorkspaceSummary; files: WorkspaceFile[]; editors: V3Editor[]; activeEditorId?: string; }
export const initialV3State: V3State = { files: [], editors: [] };
type Action = { type: 'workspace'; workspace: WorkspaceSummary; files: WorkspaceFile[] } | { type: 'open'; file: WorkspaceFile; permanent?: boolean } | { type: 'activate'; id: string } | { type: 'close'; id: string } | { type: 'preview'; mode: 'quick' | 'enhanced' };
const editorId = (path: string): string => `ui:${path.toLowerCase()}`;
export function v3Reducer(state: V3State, action: Action): V3State {
  if (action.type === 'workspace') return { ...state, workspace: action.workspace, files: action.files };
  if (action.type === 'open') {
    const id = editorId(action.file.absolutePath); const existing = state.editors.find((editor) => editor.id === id);
    if (existing) return { ...state, activeEditorId: id, editors: state.editors.map((editor) => editor.id === id && action.permanent ? { ...editor, dirty: editor.dirty } : editor) };
    const editor: V3Editor = { id, filePath: action.file.absolutePath, title: action.file.relativePath.split(/[\\/]/).pop() ?? action.file.relativePath, preview: 'quick', dirty: false };
    return { ...state, editors: [...state.editors, editor], activeEditorId: id };
  }
  if (action.type === 'activate') return state.editors.some((editor) => editor.id === action.id) ? { ...state, activeEditorId: action.id } : state;
  if (action.type === 'close') { const editors = state.editors.filter((editor) => editor.id !== action.id); return { ...state, editors, activeEditorId: state.activeEditorId === action.id ? editors.at(-1)?.id : state.activeEditorId }; }
  return { ...state, editors: state.editors.map((editor) => editor.id === state.activeEditorId ? { ...editor, preview: action.mode } : editor) };
}
interface V3ContextValue { state: V3State; dispatch: (action: Action) => void; }
const V3Context = createContext<V3ContextValue | undefined>(undefined);
export function V3StateProvider({ children }: { children: ReactNode }) { const [state, dispatch] = useReducer(v3Reducer, initialV3State); const value = useMemo(() => ({ state, dispatch }), [state]); return <V3Context.Provider value={value}>{children}</V3Context.Provider>; }
export function useV3State(): V3ContextValue { const value = useContext(V3Context); if (!value) throw new Error('useV3State must be used inside V3StateProvider'); return value; }
