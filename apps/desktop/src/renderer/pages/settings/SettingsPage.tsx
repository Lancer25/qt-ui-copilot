import { useState } from 'react';
import type { DesktopApi, UiProject, WorkspaceSummary } from '../../lib/api';
import type { SettingsSection } from '../../app/tabs/tab-model';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { QtKitsPanel } from './QtKitsPanel';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProjectBindingPanel } from './ProjectBindingPanel';
import { SettingsDetailPanel } from './SettingsDetailPanel';

const sections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: 'model', label: '模型服务', description: '连接与能力检测' }, { id: 'qt-kits', label: 'Qt Kits', description: '工具链与健康状态' }, { id: 'build-tools', label: '构建工具', description: 'CMake 与构建目录' }, { id: 'project-binding', label: '项目绑定', description: '项目级环境选择' }, { id: 'preview', label: '预览与资源', description: 'QSS、QRC 与预览' }, { id: 'navigation', label: '启动与导航', description: '运行路线与人工接管' }, { id: 'component-sources', label: '组件来源', description: '可复用组件库' }, { id: 'appearance', label: '外观', description: '主题与显示密度' }, { id: 'data-safety', label: '数据与安全', description: '本地存储与隐私' },
];
export function SettingsPage({ api, initialSection = 'model', workspace, onProjectImported }: { api: DesktopApi; initialSection?: SettingsSection; projectId?: string; workspace?: WorkspaceSummary; onProjectImported?: (project: UiProject) => void }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  return <div className="settings-page"><header className="settings-page__header"><div><p className="eyebrow">应用配置</p><h1>设置</h1><p className="muted">集中管理模型、Qt 环境与项目运行方式。{workspace ? ` 当前项目：${workspace.name}` : ''}</p></div></header><div className="settings-layout"><nav className="settings-nav" aria-label="设置分类">{sections.map((item) => <button type="button" key={item.id} className={item.id === section ? 'settings-nav__item settings-nav__item--active' : 'settings-nav__item'} onClick={() => setSection(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav><section className="settings-content" aria-live="polite">{section === 'model' && <ModelSettingsPanel api={api} />}{section === 'qt-kits' && <QtKitsPanel api={api} />}{section === 'project-binding' && <ProjectBindingPanel api={api} onProjectImported={onProjectImported} />}{section !== 'model' && section !== 'qt-kits' && section !== 'project-binding' && <SettingsDetailPanel api={api} section={section} workspace={workspace} />}</section></div></div>;
}
