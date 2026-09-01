import { useState } from 'react';
import type { DesktopApi, QtKitHealth, UiProject, WorkspaceSummary } from '../../lib/api';
import type { SettingsSection } from '../../app/tabs/tab-model';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { QtKitsPanel } from './QtKitsPanel';
import { ProjectBindingPanel } from './ProjectBindingPanel';
import { SettingsDetailPanel } from './SettingsDetailPanel';

const sections: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: 'model', label: '模型服务', description: '连接与能力检测' },
  { id: 'qt-kits', label: 'Qt Kits', description: '工具链与健康状态' },
  { id: 'build-tools', label: '构建工具', description: 'CMake 与构建目录' },
  { id: 'project-binding', label: '项目绑定', description: '项目级环境选择' },
  { id: 'preview', label: '预览与资源', description: 'QSS、QRC 与预览' },
  { id: 'navigation', label: '启动与导航', description: '运行路线与人工接管' },
  { id: 'component-sources', label: '组件来源', description: '可复用组件库' },
  { id: 'appearance', label: '外观', description: '主题与显示密度' },
  { id: 'data-safety', label: '数据与安全', description: '本地存储与隐私' },
];

export interface SettingsPageProps {
  api: DesktopApi;
  initialSection?: SettingsSection;
  central?: boolean;
  workspace?: WorkspaceSummary;
  onProjectImported?: (project: UiProject) => void;
}

const isDetailSection = (section: SettingsSection): section is Exclude<SettingsSection, 'model' | 'qt-kits' | 'project-binding'> => section !== 'model' && section !== 'qt-kits' && section !== 'project-binding';

export function SettingsPage({ api, initialSection = 'model', central = false, workspace, onProjectImported }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [visitedSections, setVisitedSections] = useState<Set<SettingsSection>>(() => new Set([initialSection]));
  const [kitHealth, setKitHealth] = useState<Record<string, QtKitHealth>>({});
  const selectSection = (next: SettingsSection) => {
    setSection(next);
    setVisitedSections((current) => current.has(next) ? current : new Set([...current, next]));
  };
  const navItems = (variant: 'desktop' | 'compact') => sections.map((item) => <button type="button" key={item.id} aria-label={variant === 'desktop' ? item.label : `切换至${item.label}`} aria-current={item.id === section ? 'page' : undefined} className={item.id === section ? 'settings-nav__item settings-nav__item--active' : 'settings-nav__item'} onClick={() => selectSection(item.id)}><strong>{item.label}</strong>{variant === 'desktop' ? <span>{item.description}</span> : null}</button>);
  const sectionContent = (id: SettingsSection) => {
    if (!visitedSections.has(id)) return null;
    if (id === 'model') return <ModelSettingsPanel api={api} />;
    if (id === 'qt-kits') return <QtKitsPanel api={api} health={kitHealth} onHealthChange={(kitId, result) => setKitHealth((old) => ({ ...old, [kitId]: result }))} />;
    if (id === 'project-binding') return <ProjectBindingPanel api={api} workspace={workspace} onProjectImported={onProjectImported} />;
    return isDetailSection(id) ? <SettingsDetailPanel api={api} section={id} workspace={workspace} /> : null;
  };

  return <div className={`settings-page${central ? ' settings-page--central' : ''}`}><header className="settings-page__header"><div><p className="eyebrow">应用配置</p><h1>设置</h1><p className="muted">集中管理模型、Qt 环境与项目运行方式。{workspace ? ` 当前项目：${workspace.name}` : ''}</p></div></header><div className="settings-layout"><nav className="settings-nav settings-nav--desktop" aria-label="设置分类">{navItems('desktop')}</nav><nav className="settings-nav settings-nav--compact" aria-label="设置分类（紧凑）">{navItems('compact')}</nav><label className="settings-nav-select"><span>设置分类</span><select aria-label="设置分类" value={section} onChange={(event) => selectSection(event.target.value as SettingsSection)}>{sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><section className="settings-content" aria-live="polite">{sections.map((item) => <div key={item.id} className="settings-content__panel" hidden={item.id !== section}>{sectionContent(item.id)}</div>)}</section></div></div>;
}
