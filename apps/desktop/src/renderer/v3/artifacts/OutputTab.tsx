import { useState } from 'react';
import type { V3TaskEvent } from '@qt-ui-copilot/contracts';

export function OutputTab({ events = [] }: { events?: V3TaskEvent[] }) {
  const [copied, setCopied] = useState(false); const output = events.map((event) => `[${new Date(event.timestamp).toLocaleTimeString()}] ${event.title}${event.detail ? `\\n${event.detail}` : ''}`).join('\\n\\n');
  const copy = async () => { try { await navigator.clipboard?.writeText(output); setCopied(true); } catch { setCopied(false); } };
  return <section className="v3-output-tab" aria-label="任务输出"><header><span>{events.length} 条事件</span><button onClick={() => void copy()}>{copied ? '已复制' : '复制日志'}</button></header><pre>{output || '尚无任务输出。'}</pre></section>;
}
