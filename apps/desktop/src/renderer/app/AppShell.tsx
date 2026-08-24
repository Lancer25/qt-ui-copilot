import { useEffect, type ReactNode } from 'react';
import { primaryNavigation, type PrimaryNavigationId } from './navigation';
import { TabBar } from './tabs/TabBar';
import { openTab } from './tabs/tab-model';
import { AppStateProvider, useAppState } from '../state/app-state';
import { NotificationProvider } from './notifications';
import { StatusBar, type StatusBarProps } from './status-bar';

export interface AppShellProps { activePage?: ReactNode; page?: ReactNode; activeNavigation?: PrimaryNavigationId; onNavigate?: (id: PrimaryNavigationId) => void; status?: StatusBarProps; children?: ReactNode; }

function ShellContent({ activePage, page, activeNavigation = 'workbench', onNavigate, status, children }: AppShellProps) {
  const state = useAppState();
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (!event.ctrlKey || event.altKey || event.metaKey) return; const index = Number(event.key) - 1; if (index >= 0 && index < primaryNavigation.length) { event.preventDefault(); onNavigate?.(primaryNavigation[index].id); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [onNavigate]);
  const navigate = (id: PrimaryNavigationId) => { if (id === 'settings') state.openTab({ id: 'settings', kind: 'settings', title: '设置', closable: true }); onNavigate?.(id); };
  return <div className="product-shell"><aside className="primary-nav" aria-label="主导航"><div className="brand-mark">Q<span>·</span>UI</div>{primaryNavigation.map((item) => <button type="button" key={item.id} className={item.id === activeNavigation ? 'primary-nav__item primary-nav__item--active' : 'primary-nav__item'} aria-current={item.id === activeNavigation ? 'page' : undefined} title={`${item.label}（${item.shortcut}）`} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.shortLabel}</span></button>)}</aside><section className="product-main"><TabBar tabs={state.tabs.tabs} activeId={state.tabs.activeId} onActivate={state.activateTab} onClose={state.closeTab} /><main className="product-page" id={`panel-${state.tabs.activeId}`}>{activePage ?? page ?? children}</main><StatusBar {...status} /></section></div>;
}

export function AppShell(props: AppShellProps) { return <AppStateProvider><NotificationProvider><ShellContent {...props} /></NotificationProvider></AppStateProvider>; }
