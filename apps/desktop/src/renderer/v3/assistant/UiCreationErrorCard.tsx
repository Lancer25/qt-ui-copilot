import { useState } from 'react';

export function UiCreationErrorCard({ title = '界面生成失败', message, retry, onDetails, onCopy, tone = 'error' }: { title?: string; message: string; retry?: () => void; onDetails?: () => void; onCopy?: () => void; tone?: 'error' | 'warning' }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toggleDetails = () => { setDetailsOpen((open) => !open); onDetails?.(); };
  return <section className={`v3-error-card ${tone === 'warning' ? 'v3-error-card--warning' : ''}`} role="alert" aria-label="任务错误"><div className="v3-error-card__heading"><span className="v3-error-icon">!</span><div><b>{title}</b><small>基础文件未写入项目，可选择重试或查看诊断。</small></div></div><div className="v3-error-card__actions">{retry && <button onClick={retry}>继续重试</button>}<button onClick={toggleDetails}>{detailsOpen ? '收起详情' : '查看详情'}</button>{onCopy && <button onClick={onCopy}>复制信息</button>}</div>{detailsOpen && <pre className="v3-error-card__details">{message}</pre>}</section>;
}
