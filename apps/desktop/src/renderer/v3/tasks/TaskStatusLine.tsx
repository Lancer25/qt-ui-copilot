import { useState } from 'react';
import type { V3TaskEvent } from '@qt-ui-copilot/contracts';

const iconFor = (status: V3TaskEvent['status']): string => {
  if (status === 'completed') return '✓';
  if (status === 'warning') return '!';
  if (status === 'failed') return '×';
  if (status === 'cancelled') return '−';
  if (status === 'running') return '•';
  return '○';
};

export function TaskStatusLine({ event }: { event: V3TaskEvent }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const status = event.status ?? (event.type === 'error' ? 'failed' : event.type === 'cancelled' ? 'cancelled' : 'running');
  return <section className={`v3-task-status v3-task-status--${status}${status === 'running' ? ' is-running' : ''}`} aria-label={event.title}>
    <span className="v3-task-status__icon" aria-hidden="true">{iconFor(status)}</span>
    <div className="v3-task-status__body"><b>{event.title}</b>{event.detail && detailsOpen ? <pre>{event.detail}</pre> : null}</div>
    {event.detail ? <button type="button" className="v3-task-status__details" aria-label={`${detailsOpen ? '收起详情' : '查看详情'}：${event.title}`} onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? '收起详情' : '查看详情'}</button> : null}
  </section>;
}
