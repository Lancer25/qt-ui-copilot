import type { UiCapabilityCandidate } from '@qt-ui-copilot/contracts';

export function CapabilityCandidates({ candidates, selectedId, onSelect }: { candidates: UiCapabilityCandidate[]; selectedId?: string; onSelect?: (candidate: UiCapabilityCandidate) => void }) {
  if (!candidates.length) return <div className="v3-capability-empty">暂无匹配的 Qt 能力</div>;
  return <section className="v3-capability-list" aria-label="Qt 能力候选">{candidates.map((candidate) => <button key={candidate.capabilityId} className={selectedId === candidate.capabilityId ? 'is-selected' : ''} onClick={() => onSelect?.(candidate)}><span><b>{candidate.displayName}</b><small>{candidate.kind} · {candidate.dependencyStatus === 'ready' ? '依赖就绪' : '将降级'}</small></span><em>{candidate.reasons[0] ?? ''}</em></button>)}</section>;
}
