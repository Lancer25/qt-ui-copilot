import type { ReactNode } from 'react';
import type { UiCapabilityCandidate } from '@qt-ui-copilot/contracts';

export function CapabilityCandidates({ candidates, selectedId, selectedIds = [], focusedId, onSelect, renderDetails }: {
  candidates: UiCapabilityCandidate[];
  selectedId?: string;
  selectedIds?: string[];
  focusedId?: string;
  onSelect?: (candidate: UiCapabilityCandidate) => void;
  renderDetails?: (candidate: UiCapabilityCandidate) => ReactNode;
}) {
  if (!candidates.length) return <div className="v3-capability-empty">暂无匹配的 Qt 能力</div>;
  return <section className="v3-capability-list" aria-label="Qt 能力候选">{candidates.map((candidate) => {
    const selected = selectedId === candidate.capabilityId || selectedIds.includes(candidate.capabilityId);
    const focused = focusedId === candidate.capabilityId;
    const expanded = focused && Boolean(renderDetails);
    const detailsId = `v3-capability-details-${encodeURIComponent(candidate.capabilityId)}`;
    const sourceName = 'sourceName' in candidate && typeof candidate.sourceName === 'string' ? candidate.sourceName : undefined;
    const needsBinaryMapping = candidate.kind === 'promoted_widget' && candidate.tags.includes('qt_binary') && candidate.dependencyStatus === 'blocked';
    return <article key={candidate.capabilityId} data-selected={selected ? 'true' : 'false'} className={['v3-capability-card', selected ? 'is-selected' : '', focused ? 'is-focused' : '', expanded ? 'is-expanded' : ''].filter(Boolean).join(' ')}>
      <button type="button" aria-current={focused ? 'true' : undefined} aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined} className="v3-capability-card__trigger" onClick={() => onSelect?.(candidate)}><span className="v3-capability-card__copy"><b title={candidate.displayName}>{candidate.displayName}</b><small><span>{candidate.kind === 'ui_fragment' ? '界面模块' : candidate.kind}</span><span className={`v3-capability-card__dependency is-${candidate.dependencyStatus}`}>{candidate.dependencyStatus === 'ready' ? '依赖就绪' : needsBinaryMapping ? '需配置映射' : candidate.dependencyStatus === 'blocked' ? '不可用' : '将降级'}</span>{sourceName ? <span className="v3-capability-card__source" title={sourceName}>{sourceName}</span> : null}</small></span>{selected || focused ? <em>{selected ? '✓ 已加入' : '正在查看'}</em> : null}</button>
      {expanded ? <div id={detailsId} className="v3-capability-card__details">{renderDetails?.(candidate)}</div> : null}
    </article>;
  })}</section>;
}
