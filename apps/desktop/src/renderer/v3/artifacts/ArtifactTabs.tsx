import type { ReactNode } from 'react';
import type { ArtifactTab } from '../state/artifact-tabs';
import './artifacts.css';

export interface ArtifactTabsProps {
  tabs: ArtifactTab[];
  activeTabId?: string;
  onActivate(id: string): void;
  onClose(id: string): void;
  /** The shell owns task-close confirmation; this component only exposes intent. */
  renderTab(tab: ArtifactTab): ReactNode;
}

const tabLabel = (tab: ArtifactTab): string => tab.kind === 'preview' && tab.temporary ? `${tab.title}，待审批` : tab.title;

/**
 * Central artifact workspace tabs. File identity and activation ordering stay in
 * artifactTabsReducer so opening the same .ui never creates duplicate tabs.
 */
export function ArtifactTabs({ tabs, activeTabId, onActivate, onClose, renderTab }: ArtifactTabsProps) {
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs.at(-1);
  return <section className="v3-artifact-workspace" aria-label="成果工作区">
    <nav className="v3-artifact-tabs" role="tablist" aria-label="工作区标签">
      {tabs.map((tab) => <div key={tab.id} className={`v3-artifact-tab${tab.id === active?.id ? ' is-active' : ''}`}>
        <button role="tab" aria-selected={tab.id === active?.id} aria-controls={`artifact-panel-${tab.id}`} onClick={() => onActivate(tab.id)}>
          <span>{tab.title}</span>{tab.kind === 'preview' && tab.temporary ? <em>待审批</em> : null}
        </button>
        {tab.kind !== 'task' ? <button type="button" className="v3-artifact-tab__close" aria-label={`关闭 ${tab.title}`} onClick={() => onClose(tab.id)}>×</button> : null}
      </div>)}
    </nav>
    {active ? <div id={`artifact-panel-${active.id}`} role="tabpanel" aria-label={tabLabel(active)} className="v3-artifact-panel">{renderTab(active)}</div> : <div className="v3-artifact-empty">打开一个文件或 AI 任务开始工作。</div>}
  </section>;
}
