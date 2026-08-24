import { useEffect, useState } from 'react';
import type { DesktopApi, ProjectSummary } from '../../lib/api';
import type { AppTab } from '../../app/tabs/tab-model';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

export function ProjectsPage({ api, onOpenTab }: { api: DesktopApi; onOpenTab: (tab: AppTab) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState('');
  const refresh = async () => { try { setError(''); setProjects(await api.projects.list()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  useEffect(() => { void refresh(); }, []);
  return <section className="page-content ui-stack" aria-label="项目">
    <header className="page-heading"><div><p className="eyebrow">PROJECTS</p><h1>项目</h1><p>管理已导入的 Qt 工程，快速打开界面文件并查看环境状态。</p></div><Button onClick={refresh}>刷新</Button></header>
    {error && <p role="alert" className="message">{error}</p>}
    {projects.length === 0 ? <EmptyState icon="⌂" title="还没有导入项目" description="从 AI 工作台导入一个 Qt 工程后，它会出现在这里。" /> : <div className="ui-grid ui-grid--two">{projects.map((project) => <Card key={project.id} variant="outlined" className="project-card">
      <div className="ui-cluster project-card__title"><div><h2>{project.rootDir.split(/[\\/]/).pop() || project.rootDir}</h2><p className="muted project-card__path">{project.rootDir}</p></div><Badge tone={project.health === 'ready' ? 'success' : project.health === 'missing' ? 'error' : 'warning'}>{project.health === 'ready' ? '环境就绪' : project.health === 'missing' ? '目录不可用' : '需要配置'}</Badge></div>
      <p className="muted">{project.uiFiles.length} 个 .ui 文件{project.profilePath ? ' · 已绑定项目配置' : ''}</p>
      <div className="project-card__files">{project.uiFiles.slice(0, 8).map((file) => <Button key={file} variant="ghost" onClick={() => onOpenTab({ id: `ui:${file}`, kind: 'ui', title: file.split(/[\\/]/).pop() || file, closable: true, projectId: project.id, uiFile: file })}>{file}</Button>)}{project.uiFiles.length > 8 && <span className="muted">还有 {project.uiFiles.length - 8} 个文件</span>}</div>
    </Card>)}</div>}
  </section>;
}
