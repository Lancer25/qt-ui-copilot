import type { ReactNode } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

export type WorkspaceActivity = 'explorer' | 'tasks' | 'search' | 'components' | 'settings';

export interface WorkspaceShellProps {
  titlebar: ReactNode;
  activity: WorkspaceActivity;
  onActivityChange(activity: WorkspaceActivity): void;
  sidebar?: ReactNode;
  workspace: ReactNode;
  children?: ReactNode;
}

const activityLabels: Array<{ id: WorkspaceActivity; label: string; glyph: string }> = [
  { id: 'explorer', label: 'Explorer', glyph: '⌂' },
  { id: 'tasks', label: '任务', glyph: '◌' },
  { id: 'search', label: '搜索', glyph: '⌕' },
  { id: 'components', label: '组件库', glyph: '⊞' },
  { id: 'settings', label: '设置', glyph: '⚙' },
];

/** Pure layout boundary: titlebar, activity rail, contextual sidebar and central tabs. */
export function WorkspaceShell({ titlebar, activity, onActivityChange, sidebar, workspace, children }: WorkspaceShellProps) {
  return <div className="v3-root">
    {titlebar}
    <div className={`v3-workspace-shell${sidebar === undefined ? ' has-no-sidebar' : ''}`}>
      <aside className="v3-activity" aria-label="活动栏">{activityLabels.map((item) => <button key={item.id} type="button" aria-label={item.label} title={item.label} aria-pressed={activity === item.id} className={activity === item.id ? 'is-active' : ''} onClick={() => onActivityChange(item.id)}><WorkspaceIcon name={item.id} /></button>)}</aside>
      {sidebar === undefined ? null : <aside className="v3-sidebar" aria-label={activity === 'tasks' ? '任务历史' : '项目文件'}>{sidebar}</aside>}
      <div className="v3-workspace-main">{workspace}</div>
      {children}
    </div>
  </div>;
}
