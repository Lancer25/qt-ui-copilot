import type { WorkflowUiState } from '../../lib/api';
import { sanitizeFailureMessage } from '../../lib/failure-display';

export function WorkflowTimeline({ task, onTakeOver, onCancel, onAccept, onRollback }: {
  task?: WorkflowUiState;
  onTakeOver: () => void; onCancel: () => void; onAccept: () => void; onRollback: () => void;
}) {
  const waiting = task?.status === 'waiting_approval';
  return <aside aria-label="任务执行" className="timeline"><h2>任务执行</h2>
    <p>{task ? `${task.node} · ${task.status}` : '等待创建任务'}</p>
    <ol>{task?.events.map((event, index) => {
      const detail = event.detail ? ` · ${sanitizeFailureMessage(event.detail)}` : '';
      return <li key={`${event.node}-${index}`} aria-label={`${event.node} ${event.status}${detail}`}><strong>{event.node}</strong><span>{event.status}{detail}</span></li>;
    })}</ol>
    <div className="actions">
      <button onClick={onTakeOver} disabled={!task || task.status === 'completed'}>人工接管导航</button>
      <button onClick={onCancel} disabled={!task || task.status === 'completed'}>取消任务</button>
      <button onClick={onAccept} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>接受修改</button>
      <button onClick={onRollback} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>回滚修改</button>
    </div>
  </aside>;
}
