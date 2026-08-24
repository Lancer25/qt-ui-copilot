export function UiDiffPanel({ before, after, findings, visualFindings, visualReviewStatus, evidence, routeEvidence }: {
  before?: string; after?: string; findings: readonly string[]; visualFindings: readonly string[]; visualReviewStatus?: 'not_run' | 'passed' | 'unavailable' | 'failed'; evidence: readonly string[]; routeEvidence: readonly string[];
}) {
  return <section aria-label="差异与证据" className="diff-panel"><h2>XML Diff / 检查 / 路线</h2><div className="diff-columns">
  <pre aria-label="修改前 XML">{before ?? '尚无 XML 基线'}</pre><pre aria-label="修改后 XML">{after ?? '尚无候选修改'}</pre>
  </div><div className="findings"><div><strong>确定性检查</strong>{findings.map((item) => <p key={item}>{item}</p>)}</div>
    <div><strong>视觉评审：{visualReviewStatus === 'unavailable' ? '不可用（未判定通过）' : visualReviewStatus === 'passed' ? '已完成' : visualReviewStatus === 'failed' ? '未通过' : '未运行'}</strong>{visualFindings.length ? visualFindings.map((item) => <p key={item}>{item}</p>) : <p>暂无视觉评审结果</p>}</div>
    <div><strong>工作流证据</strong>{evidence.map((item) => <p key={item}>{item}</p>)}</div>
    <div><strong>路线证据</strong>{routeEvidence.map((item) => <p key={item}>{item}</p>)}</div></div>
  </section>;
}
