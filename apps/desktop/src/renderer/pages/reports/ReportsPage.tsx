import { useEffect, useState } from 'react';
import type { DesktopApi, TaskSummary } from '../../lib/api';
import type { AppTab } from '../../app/tabs/tab-model';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

export function ReportsPage({ api, onOpenTab }: { api: DesktopApi; onOpenTab: (tab: AppTab) => void }) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]); const [error, setError] = useState('');
  useEffect(() => { void api.tasks.list().then(setTasks).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, [api]);
  const reports = tasks.filter((task) => task.lastEvent?.status === 'completed' || task.lastEvent?.node === 'REPORT');
  return <section className="page-content ui-stack" aria-label="报告">
    <header className="page-heading"><div><p className="eyebrow">EVIDENCE REPORTS</p><h1>报告</h1><p>查看任务验证证据，打开报告详情或导出 HTML 归档。</p></div></header>
    {error && <p role="alert" className="message">{error}</p>}
    {reports.length === 0 ? <EmptyState icon="▤" title="暂无可用报告" description="完成一次任务后，确定性检查、截图和运行证据会汇总为报告。" /> : <div className="ui-grid ui-grid--two">{reports.map((task) => <Card key={task.id} variant="outlined"><div className="ui-cluster"><Badge tone="success">已生成</Badge><span className="muted">{new Date(task.updatedAt).toLocaleString()}</span></div><h2>{task.targetUi}</h2><p className="muted">任务 {task.id}</p><div className="ui-cluster"><Button variant="primary" onClick={() => onOpenTab({ id: `report:${task.id}`, kind: 'report', title: `报告 ${task.id.slice(0, 8)}`, closable: true, taskId: task.id })}>查看报告</Button><Button variant="ghost" onClick={() => onOpenTab({ id: `task:${task.id}`, kind: 'task', title: `任务 ${task.id.slice(0, 8)}`, closable: true, taskId: task.id })}>查看任务</Button></div></Card>)}</div>}
  </section>;
}
