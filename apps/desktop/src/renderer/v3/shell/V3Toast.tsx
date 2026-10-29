import { useEffect } from 'react';

export type V3Notice = { id: number; text: string; tone: 'success' | 'info' | 'error' };

export function V3Toast({ notice, onDismiss }: { notice: V3Notice; onDismiss(): void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, notice.tone === 'error' ? 8000 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice.id, notice.tone, onDismiss]);
  return <aside className={`v3-toast v3-toast--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}>
    <span className="v3-toast__icon" aria-hidden="true">{notice.tone === 'success' ? '✓' : notice.tone === 'error' ? '!' : 'i'}</span>
    <span className="v3-toast__text">{notice.text}</span>
    <button type="button" aria-label="关闭提示" onClick={onDismiss}>×</button>
  </aside>;
}
