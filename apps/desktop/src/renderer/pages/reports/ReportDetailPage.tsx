import { useEffect, useState } from 'react';
import type { DesktopApi, WorkflowUiState } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EvidenceReport, makeReportRequest } from '../../features/report/EvidenceReport';

export function ReportDetailPage({ api, taskId }: { api: DesktopApi; taskId: string }) {
  const [task, setTask] = useState<WorkflowUiState>(); const [error, setError] = useState('');
  useEffect(() => { void api.tasks.get({ taskId }).then(setTask).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))); }, [api, taskId]);
  if (error) return <section className="page-content"><Card><p role="alert">{error}</p></Card></section>;
  if (!task) return <section className="page-content"><Card><p className="muted">正在加载报告…</p></Card></section>;
  return <section className="page-content ui-stack" aria-label="报告详情"><header className="page-heading"><div><p className="eyebrow">REPORT DETAIL</p><h1>{task.targetUi}</h1><p>任务 {task.taskId} · {task.status}</p></div><Button onClick={() => void api.reports.export(makeReportRequest(task))}>导出 HTML</Button></header><EvidenceReport task={task} onExport={() => void api.reports.export(makeReportRequest(task))} /></section>;
}
