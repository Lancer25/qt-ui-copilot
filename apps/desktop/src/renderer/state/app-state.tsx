import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { activateTab, closeTab, initialTabState, openTab, restoreTabs, serializeTabs, type AppTab, type TabState } from '../app/tabs/tab-model';

const STORAGE_KEY = 'qt-ui-copilot:v2-tabs';
type Action = { type: 'open'; tab: AppTab } | { type: 'activate'; id: AppTab['id'] } | { type: 'close'; id: AppTab['id'] };
const reducer = (state: TabState, action: Action): TabState => action.type === 'open' ? openTab(state, action.tab) : action.type === 'activate' ? activateTab(state, action.id) : closeTab(state, action.id);

interface AppStateContextValue { tabs: TabState; openTab: (tab: AppTab) => void; activateTab: (id: AppTab['id']) => void; closeTab: (id: AppTab['id']) => void; }
const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children, storage }: { children: ReactNode; storage?: Storage }) {
  const persistent = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  const [tabs, dispatch] = useReducer(reducer, undefined, () => restoreTabs(persistent?.getItem(STORAGE_KEY) ?? null));
  useEffect(() => { persistent?.setItem(STORAGE_KEY, serializeTabs(tabs)); }, [persistent, tabs]);
  const value = useMemo(() => ({ tabs, openTab: (tab: AppTab) => dispatch({ type: 'open', tab }), activateTab: (id: AppTab['id']) => dispatch({ type: 'activate', id }), closeTab: (id: AppTab['id']) => dispatch({ type: 'close', id }) }), [tabs]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
