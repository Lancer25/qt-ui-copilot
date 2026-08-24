import { useEffect, useState } from 'react';
import type { DesktopApi, TaskSummary } from '../../lib/api';
import type { AppTab } from '../../app/tabs/tab-model';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

const statusLabel = (status?: string): { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' } => status === 'completed' ? { label: '已完成', tone: 'success' } : status === 'failed' ? { label: '失败', tone: 'error' } : status === 'cancelled' ? { label: '已取消', tone: 'neutral' } : { label: status ? '进行中' : '未开始', tone: 'warning' };

export function TasksPage({ api, onOpenTab }: { api: DesktopApi; onOpenTab: (tab: AppTab) => void }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]); const [error, setError] = useState('');
  const refresh = async () => { try { setError(''); setTasks(await api.tasks.list()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  useEffect(() => { void refresh(); }, []);
  return <section className="page-content ui-stack" aria-label="任务">
    <header className="page-heading"><div><p className="eyebrow">TASK HISTORY</p><h1>任务</h1><p>查看 AI 修改任务的持久化进度、目标界面与最后验证节点。</p></div><Button onClick={refresh}>刷新</Button></header>
    {error && <p role="alert" className="message">{error}</p>}
    {tasks.length === 0 ? <EmptyState icon="✓" title="暂无任务记录" description="在 AI 工作台创建一个任务后，执行轨迹会自动保存在这里。" /> : <div className="ui-stack">{tasks.map((task) => { const status = statusLabel(task.lastEvent?.status); return <Card key={task.id} variant="outlined" className="task-row"><div><p className="muted">{task.id}</p><h2>{task.targetUi}</h2><p className="muted">最后节点：{task.lastEvent?.node ?? '等待启动'} · {new Date(task.updatedAt).toLocaleString()}</p></div><div className="ui-cluster"><Badge tone={status.tone}>{status.label}</Badge><Button onClick={() => onOpenTab({ id: `task:${task.id}`, kind: 'task', title: `任务 ${task.id.slice(0, 8)}`, closable: true, taskId: task.id })}>查看详情</Button><Button variant="ghost" onClick={() => onOpenTab({ id: `report:${task.id}`, kind: 'report', title: `报告 ${task.id.slice(0, 8)}`, closable: true, taskId: task.id })}>打开报告</Button></div></Card>; })}</div>}
  </section>;
}
