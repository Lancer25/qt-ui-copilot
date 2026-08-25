import { useState } from 'react';

export function BottomPanel({ findings = [] }: { findings?: string[] }) {
  const [tab, setTab] = useState<'problems' | 'resources' | 'output'>('problems');
  return <section className="v3-bottom-panel" aria-label="底部辅助面板"><nav>{(['problems', 'resources', 'output'] as const).map((id) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{id === 'problems' ? 'Problems' : id === 'resources' ? 'Resources' : 'Output'}</button>)}</nav><div>{tab === 'problems' && (findings.length ? findings.map((finding) => <p key={finding}>{finding}</p>) : <p className="muted">没有问题</p>)}{tab === 'resources' && <p className="muted">增强预览后显示 QSS、QRC、字体和插件加载结果。</p>}{tab === 'output' && <p className="muted">PreviewHost 和 AI 请求日志将在这里显示。</p>}</div></section>;
}
