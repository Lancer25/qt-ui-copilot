import { useEffect, useState } from 'react';
import type { V3TaskHistoryItem } from '@qt-ui-copilot/contracts';
import type { DesktopApi } from '../../lib/api';

export interface TaskHistoryPanelProps {
  api: DesktopApi;
  workspaceId?: string;
  onOpenTask(taskId: string, title: string): void;
  onStartNewTask?: () => void;
}

const leafName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const statusLabel = (task: V3TaskHistoryItem): string => {
  switch (task.status) {
    case 'pending':
    case 'running': return '运行中';
    case 'failed': return '失败';
    case 'cancelled': return '已取消';
    case 'warning': return '需处理';
    default: return '已完成';
  }
};

/** Compact, project-scoped history for reopening a persisted task in the central tab area. */
export function TaskHistoryPanel({ api, workspaceId, onOpenTask, onStartNewTask }: TaskHistoryPanelProps) {
  const [tasks, setTasks] = useState<V3TaskHistoryItem[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    if (!api.ai?.listTaskSnapshots) return;
    void api.ai.listTaskSnapshots(workspaceId ? { workspaceId } : undefined)
      .then((items) => { if (live) setTasks([...items].sort((a, b) => b.updatedAt - a.updatedAt)); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, [api.ai, workspaceId]);

  return <section className="v3-task-history" aria-label="任务历史">
    <h2>任务历史</h2>
    {error ? <p role="alert">{error}</p> : null}
    {!error && !tasks.length ? <div className="v3-task-history__empty"><span aria-hidden="true">✦</span><b>还没有历史任务</b><p>新的 AI 请求会显示在这里，方便随时继续。</p>{onStartNewTask ? <button type="button" onClick={onStartNewTask}>开始新任务</button> : null}</div> : null}
    <div className="v3-task-history__list">
      {tasks.map((task) => <button key={task.taskId} type="button" onClick={() => onOpenTask(task.taskId, task.targetPath ? leafName(task.targetPath) : task.title)}>
        <span><b>{task.targetPath ? leafName(task.targetPath) : task.title}</b><small>{new Date(task.updatedAt).toLocaleString()}</small></span>
        <em className={`is-${task.status}`}>{statusLabel(task)}</em>
      </button>)}
    </div>
  </section>;
}
