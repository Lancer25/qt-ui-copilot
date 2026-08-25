import { useEffect, type ReactNode } from 'react';
import { primaryNavigation, type PrimaryNavigationId } from './navigation';
import { TabBar } from './tabs/TabBar';
import type { AppTab } from './tabs/tab-model';
import { AppStateProvider, useAppState } from '../state/app-state';
import { NotificationProvider } from './notifications';
import { StatusBar, type StatusBarProps } from './status-bar';

export interface AppShellProps { activePage?: ReactNode; page?: ReactNode; renderPage?: (id: PrimaryNavigationId, openTab: (tab: AppTab) => void, activeTab?: AppTab) => ReactNode; activeNavigation?: PrimaryNavigationId; onNavigate?: (id: PrimaryNavigationId) => void; status?: StatusBarProps; children?: ReactNode; }

function ShellContent({ activePage, page, renderPage, activeNavigation = 'workbench', onNavigate, status, children }: AppShellProps) {
  const state = useAppState();
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (!event.ctrlKey || event.altKey || event.metaKey) return; const index = Number(event.key) - 1; if (index >= 0 && index < primaryNavigation.length) { event.preventDefault(); onNavigate?.(primaryNavigation[index].id); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [onNavigate]);
  const navigate = (id: PrimaryNavigationId) => { onNavigate?.(id); };
  const activate = (id: AppTab['id']) => { state.activateTab(id); const tab = state.tabs.tabs.find((candidate) => candidate.id === id); if (tab?.kind === 'settings') onNavigate?.('settings'); else if (tab?.kind === 'workbench') onNavigate?.('workbench'); else if (tab?.kind === 'ui') onNavigate?.('projects'); else if (tab?.kind === 'task' || tab?.kind === 'report') onNavigate?.(tab.kind === 'task' ? 'tasks' : 'reports'); };
  const activeTab = state.tabs.tabs.find((tab) => tab.id === state.tabs.activeId);
  return <div className="desktop-chrome"><header className="app-titlebar"><div className="app-titlebar__brand"><span className="app-titlebar__icon">◈</span><span>Qt UI Copilot</span></div><div className="app-titlebar__controls"><button type="button" aria-label="最小化" onClick={() => window.qtUiCopilot.window?.minimize()}>—</button><button type="button" aria-label="最大化或还原" onClick={() => void window.qtUiCopilot.window?.toggleMaximize()}>□</button><button type="button" aria-label="关闭窗口" onClick={() => window.qtUiCopilot.window?.close()}>×</button></div></header><div className="product-shell"><aside className="primary-nav" aria-label="主导航"><div className="brand-mark">Q<span>·</span>UI</div>{primaryNavigation.map((item) => <button type="button" key={item.id} className={item.id === activeNavigation ? 'primary-nav__item primary-nav__item--active' : 'primary-nav__item'} aria-current={item.id === activeNavigation ? 'page' : undefined} title={`${item.label}（${item.shortcut}）`} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.shortLabel}</span></button>)}</aside><section className="product-main"><TabBar tabs={state.tabs.tabs} activeId={state.tabs.activeId} onActivate={activate} onClose={state.closeTab} /><main className="product-page" id={`panel-${state.tabs.activeId}`}>{renderPage?.(activeNavigation, state.openTab, activeTab) ?? activePage ?? page ?? children}</main><StatusBar {...status} /></section></div></div>;
}

export function AppShell(props: AppShellProps) { return <AppStateProvider><NotificationProvider><ShellContent {...props} /></NotificationProvider></AppStateProvider>; }
