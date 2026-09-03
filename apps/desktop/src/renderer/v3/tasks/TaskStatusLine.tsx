import { useEffect, useState } from 'react';
import type { V3TaskEvent } from '@qt-ui-copilot/contracts';

function StatusIcon({ status }: { status: V3TaskEvent['status'] }) {
  const path = status === 'completed' ? 'M5 12l4 4L19 6' : status === 'failed' ? 'M7 7l10 10M17 7 7 17' : status === 'cancelled' ? 'M6 12h12' : status === 'warning' ? 'M12 7v6m0 4h.01' : status === 'running' ? 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z' : 'M12 7v10m-5-5h10';
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export function TaskStatusLine({ event }: { event: V3TaskEvent }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const status = event.status ?? (event.type === 'error' ? 'failed' : event.type === 'cancelled' ? 'cancelled' : 'running');
  useEffect(() => { if (status !== 'running') return; const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - event.timestamp) / 1000))); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [event.timestamp, status]);
  return <section className={`v3-task-status v3-task-status--${status}${status === 'running' ? ' is-running' : ''}`} aria-label={event.title}>
    <span className="v3-task-status__icon"> <StatusIcon status={status} /></span>
    <div className="v3-task-status__body"><b>{event.title}</b>{status === 'running' ? <small className="v3-task-status__elapsed"> · 已等待 {elapsedSeconds} 秒</small> : null}{event.detail && detailsOpen ? <pre>{event.detail}</pre> : null}</div>
    {event.detail ? <button type="button" className="v3-task-status__details" aria-label={`${detailsOpen ? '收起详情' : '查看详情'}：${event.title}`} onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? '收起详情' : '查看详情'}</button> : null}
  </section>;
}
