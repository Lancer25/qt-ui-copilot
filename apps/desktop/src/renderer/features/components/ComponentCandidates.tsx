import type { ComponentCandidate } from '@qt-ui-copilot/component-library';

export function ComponentCandidates({ candidates, selectedId, onSelect }: {
  candidates: readonly ComponentCandidate[]; selectedId?: string; onSelect: (candidate: ComponentCandidate) => void;
}) {
  return <section aria-label="可复用组件" className="components"><h2>可复用组件</h2>
    {candidates.length === 0 ? <p className="muted">暂无匹配组件</p> : candidates.map((candidate) => <button key={candidate.componentId}
      className={selectedId === candidate.componentId ? 'candidate selected' : 'candidate'} onClick={() => onSelect(candidate)}>
      <strong>{candidate.component.name}</strong><span>{candidate.component.description}</span>
      <small>{candidate.missingDependencies.length ? candidate.missingDependencies.join('；') : `匹配分 ${candidate.score.toFixed(0)}`}</small>
    </button>)}
  </section>;
}
