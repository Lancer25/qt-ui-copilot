import { useEffect, useState } from 'react';
import type { DesktopApi, TaskSummary } from '../../lib/api';

export interface TaskHistoryPanelProps {
  api: DesktopApi;
  projectId?: string;
  onOpenTask(taskId: string, title: string): void;
}

const leafName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const statusLabel = (task: TaskSummary): string => {
  switch (task.lastEvent?.status) {
    case 'started': return '运行中';
    case 'failed': return '失败';
    case 'cancelled': return '已取消';
    default: return '已完成';
  }
};

/** Compact, project-scoped history for reopening a persisted task in the central tab area. */
export function TaskHistoryPanel({ api, projectId, onOpenTask }: TaskHistoryPanelProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    if (!api.tasks?.list) return;
    void api.tasks.list(projectId ? { projectId } : undefined)
      .then((items) => { if (live) setTasks([...items].sort((a, b) => b.updatedAt - a.updatedAt)); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, [api.tasks, projectId]);

  return <section className="v3-task-history" aria-label="任务历史">
    <h2>任务历史</h2>
    {error ? <p role="alert">{error}</p> : null}
    {!error && !tasks.length ? <p className="v3-task-history__empty">还没有历史任务。新的 AI 请求会显示在这里。</p> : null}
    <div className="v3-task-history__list">
      {tasks.map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task.id, leafName(task.targetUi))}>
        <span><b>{leafName(task.targetUi)}</b><small>{new Date(task.updatedAt).toLocaleString()}</small></span>
        <em className={`is-${task.lastEvent?.status ?? 'completed'}`}>{statusLabel(task)}</em>
      </button>)}
    </div>
  </section>;
}
