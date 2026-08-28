export function DiffTab({ before = '', after = '', title = '界面变更' }: { before?: string; after?: string; title?: string }) {
  const changed = before !== after;
  return <section className="v3-diff-tab" aria-label="界面差异"><header><b>{title}</b><span>{changed ? '待审批变更' : '没有可显示的文本差异'}</span></header>{changed ? <div className="v3-diff-tab__columns"><pre aria-label="修改前"><code>{before}</code></pre><pre aria-label="修改后"><code>{after}</code></pre></div> : <p>候选生成后将在这里显示 XML 差异。</p>}</section>;
}
