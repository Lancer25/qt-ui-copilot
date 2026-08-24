import { useEffect, useState } from 'react';
import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import type { DesktopApi, ProjectSummary } from '../../lib/api';
import type { AppTab } from '../../app/tabs/tab-model';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

export function ComponentsPage({ api, onOpenTab }: { api: DesktopApi; onOpenTab: (tab: AppTab) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ComponentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { void api.projects.list().then((items) => { setProjects(items); if (items[0]) setProjectId(items[0].id); }).catch(() => undefined); }, [api]);
  const search = async () => { if (!projectId) return; setLoading(true); try { setCandidates(await api.components.search({ projectId, query })); } finally { setLoading(false); } };
  return <section className="page-content ui-stack" aria-label="组件库">
    <header className="page-heading"><div><p className="eyebrow">COMPONENT LIBRARY</p><h1>组件库</h1><p>从当前项目和本地组件目录中检索可复用的 Qt Widgets 结构。</p></div></header>
    <Card className="search-bar"><label>项目<select aria-label="组件库项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.rootDir}</option>)}</select></label><label className="search-bar__query">搜索组件<input aria-label="搜索组件" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder="例如：登录、表单、设置窗口" /></label><Button variant="primary" loading={loading} onClick={() => void search()}>搜索</Button></Card>
    {candidates.length === 0 ? <EmptyState icon="◇" title="输入需求开始检索" description="搜索结果会显示结构摘要、匹配理由和依赖状态。" /> : <div className="ui-grid ui-grid--two">{candidates.map((candidate) => <Card key={candidate.componentId} variant="outlined"><div className="ui-cluster"><div><h2>{candidate.component.name}</h2><p>{candidate.component.description}</p></div><Badge tone={candidate.missingDependencies.length ? 'warning' : 'success'}>{candidate.missingDependencies.length ? '有依赖' : `匹配 ${candidate.score.toFixed(0)}`}</Badge></div><p className="muted">{candidate.component.structureSummary}</p><div className="tag-list">{candidate.component.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>{candidate.missingDependencies.length > 0 && <p className="warning-text">{candidate.missingDependencies.join('；')}</p>}<Button variant="ghost" onClick={() => onOpenTab({ id: `ui:${candidate.component.sourceUiFile}`, kind: 'ui', title: candidate.component.name, closable: true, projectId, uiFile: candidate.component.sourceUiFile })}>打开源界面</Button></Card>)}</div>}
  </section>;
}
