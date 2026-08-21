import type { WorkflowUiState } from '../../lib/api';

export function WorkflowTimeline({ task, onApprove, onTakeOver, onCancel, onAccept, onRollback }: {
  task?: WorkflowUiState;
  onApprove: () => void; onTakeOver: () => void; onCancel: () => void; onAccept: () => void; onRollback: () => void;
}) {
  const waiting = task?.status === 'waiting_approval';
  return <aside aria-label="任务执行" className="timeline"><h2>任务执行</h2>
    <p>{task ? `${task.node} · ${task.status}` : '等待创建任务'}</p>
    <ol>{task?.events.map((event, index) => <li key={`${event.node}-${index}`}><strong>{event.node}</strong><span>{event.status}{event.detail ? ` · ${event.detail}` : ''}</span></li>)}</ol>
    <div className="actions">
      <button onClick={onApprove} disabled={!waiting || task?.node !== 'USER_APPROVAL'}>批准计划</button>
      <button onClick={onTakeOver} disabled={!task || task.status === 'completed'}>人工接管导航</button>
      <button onClick={onCancel} disabled={!task || task.status === 'completed'}>取消任务</button>
      <button onClick={onAccept} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>接受修改</button>
      <button onClick={onRollback} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>回滚修改</button>
    </div>
  </aside>;
}
