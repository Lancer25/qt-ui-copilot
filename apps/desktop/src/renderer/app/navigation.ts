export type PrimaryNavigationId = 'workbench' | 'projects' | 'components' | 'tasks' | 'reports' | 'settings';

export interface PrimaryNavigationItem {
  id: PrimaryNavigationId;
  label: string;
  shortLabel: string;
  icon: string;
  shortcut: string;
}

export const primaryNavigation: readonly PrimaryNavigationItem[] = [
  { id: 'workbench', label: 'AI 工作台', shortLabel: '工作台', icon: '✦', shortcut: 'Ctrl+1' },
  { id: 'projects', label: '项目', shortLabel: '项目', icon: '⌂', shortcut: 'Ctrl+2' },
  { id: 'components', label: '组件库', shortLabel: '组件', icon: '◇', shortcut: 'Ctrl+3' },
  { id: 'tasks', label: '任务', shortLabel: '任务', icon: '✓', shortcut: 'Ctrl+4' },
  { id: 'reports', label: '报告', shortLabel: '报告', icon: '▤', shortcut: 'Ctrl+5' },
  { id: 'settings', label: '设置', shortLabel: '设置', icon: '⚙', shortcut: 'Ctrl+6' },
];

export const navigationLabel = (id: PrimaryNavigationId): string =>
  primaryNavigation.find((item) => item.id === id)?.label ?? id;
