import type { AppTab } from './tab-model';

export function TabBar({ tabs, activeId, onActivate, onClose }: { tabs: AppTab[]; activeId: AppTab['id']; onActivate: (id: AppTab['id']) => void; onClose: (id: AppTab['id']) => void }) {
  return <div className="tab-bar" role="tablist" aria-label="已打开页面">
    {tabs.map((tab) => <div className={`app-tab${tab.id === activeId ? ' app-tab--active' : ''}`} key={tab.id} role="presentation">
      <button type="button" role="tab" aria-selected={tab.id === activeId} aria-controls={`panel-${tab.id}`} onClick={() => onActivate(tab.id)}>{tab.title}</button>
      {tab.closable && <button type="button" className="app-tab__close" aria-label={`关闭${tab.title}`} onClick={() => onClose(tab.id)}>×</button>}
    </div>)}
  </div>;
}
