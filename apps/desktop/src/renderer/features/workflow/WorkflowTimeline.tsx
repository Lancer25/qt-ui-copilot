import type { WorkflowUiState } from '../../lib/api';
import { sanitizeFailureMessage } from '../../lib/failure-display';

const verificationBadge = (node: string, status: string): string | undefined => {
  if (node === 'UIC_VALIDATE') return status === 'completed' ? 'uic 校验通过' : status === 'failed' ? 'uic 校验失败' : undefined;
  if (node === 'CAPTURE_REAL_RESULT') return status === 'completed' ? '真实应用验证通过' : status === 'failed' ? '真实应用验证失败' : undefined;
  return undefined;
};

export function WorkflowTimeline({ task, onTakeOver, onCancel, onAccept, onRollback }: {
  task?: WorkflowUiState;
  onTakeOver: () => void; onCancel: () => void; onAccept: () => void; onRollback: () => void;
}) {
  const waiting = task?.status === 'waiting_approval';
  return <aside aria-label="任务执行" className="timeline"><h2>任务执行</h2>
    <p>{task ? `${task.node} · ${task.status}` : '等待创建任务'}</p>
    <ol>{task?.events.map((event, index) => {
      const detail = event.detail ? ` · ${sanitizeFailureMessage(event.detail)}` : '';
      const badge = verificationBadge(event.node, event.status);
      return <li key={`${event.node}-${index}`} aria-label={`${event.node} ${event.status}${detail}`}><strong>{event.node}</strong><span>{event.status}{detail}</span>{badge && <span className={`verification-badge ${event.status === 'completed' ? 'verification-success' : 'verification-failure'}`} role="status" style={{ color: event.status === 'completed' ? '#bbf7d0' : '#fecaca', background: event.status === 'completed' ? '#14532d' : '#7f1d1d', border: `1px solid ${event.status === 'completed' ? '#22c55e' : '#ef4444'}`, borderRadius: 999, display: 'inline-block', padding: '2px 7px', width: 'max-content', fontSize: 11, fontWeight: 600 }}>{badge}</span>}</li>;
    })}</ol>
    <div className="actions">
      <button onClick={onTakeOver} disabled={!task || task.status === 'completed'}>人工接管导航</button>
      <button onClick={onCancel} disabled={!task || task.status === 'completed'}>取消任务</button>
      <button onClick={onAccept} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>接受修改</button>
      <button onClick={onRollback} disabled={!waiting || task?.node !== 'ACCEPT_OR_ROLLBACK'}>回滚修改</button>
    </div>
  </aside>;
}
