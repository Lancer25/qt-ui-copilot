export function UiDiffPanel({ before, after, findings, visualFindings, routeEvidence }: {
  before?: string; after?: string; findings: readonly string[]; visualFindings: readonly string[]; routeEvidence: readonly string[];
}) {
  return <section aria-label="差异与证据" className="diff-panel"><h2>XML Diff / 检查 / 路线</h2><div className="diff-columns">
    <pre aria-label="修改前 XML">{before ?? '尚无 XML 基线'}</pre><pre aria-label="修改后 XML">{after ?? '尚无候选修改'}</pre>
  </div><div className="findings"><div><strong>确定性检查</strong>{findings.map((item) => <p key={item}>{item}</p>)}</div>
    <div><strong>视觉评审</strong>{visualFindings.map((item) => <p key={item}>{item}</p>)}</div>
    <div><strong>路线证据</strong>{routeEvidence.map((item) => <p key={item}>{item}</p>)}</div></div>
  </section>;
}
