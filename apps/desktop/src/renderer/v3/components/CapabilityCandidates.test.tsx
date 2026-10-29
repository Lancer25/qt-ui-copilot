// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CapabilityCandidates } from './CapabilityCandidates';
afterEach(cleanup);
describe('CapabilityCandidates', () => {
  const candidate = { capabilityId: 'qt.widgets.QStatusBar', displayName: 'QStatusBar', kind: 'qt_widget' as const, description: 'status', tags: ['qt'], dependencyStatus: 'ready' as const, reasons: ['Qt Widgets 内置能力'] };

  it('shows capability source and dependency state', () => {
    render(<CapabilityCandidates candidates={[candidate]} />);
    expect(screen.getByText('QStatusBar')).toBeTruthy();
    expect(screen.getByText(/依赖就绪/)).toBeTruthy();
  });

  it('distinguishes the focused card from a component added to the task', () => {
    const { rerender } = render(<CapabilityCandidates candidates={[candidate]} focusedId={candidate.capabilityId} />);
    const button = screen.getByRole('button', { name: /QStatusBar/ });
    const card = button.closest('.v3-capability-card');
    expect(card?.classList.contains('is-focused')).toBe(true);
    expect(card?.classList.contains('is-selected')).toBe(false);
    expect(screen.getByText('正在查看')).toBeTruthy();

    rerender(<CapabilityCandidates candidates={[candidate]} focusedId={candidate.capabilityId} selectedIds={[candidate.capabilityId]} />);
    expect(card?.classList.contains('is-selected')).toBe(true);
    expect(screen.getByText('✓ 已加入')).toBeTruthy();
  });

  it('renders inline details only inside the focused candidate card', () => {
    const first = { ...candidate, capabilityId: 'first', displayName: 'First' };
    const second = { ...candidate, capabilityId: 'second', displayName: 'Second' };

    render(
      <CapabilityCandidates
        candidates={[first, second]}
        focusedId="second"
        renderDetails={(item) => <div data-testid={`details-${item.capabilityId}`}>详情</div>}
      />
    );

    const firstTrigger = screen.getByRole('button', { name: /First/ });
    const secondTrigger = screen.getByRole('button', { name: /Second/ });
    const secondDetails = screen.getByTestId('details-second');

    expect(screen.queryByTestId('details-first')).toBeNull();
    expect(secondDetails).toBeTruthy();
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(secondTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(secondTrigger.getAttribute('aria-controls')).toBe(secondDetails.parentElement?.id);
    expect(secondDetails.parentElement?.id).toBe('v3-capability-details-second');
    expect(secondTrigger.closest('.v3-capability-card')?.classList.contains('is-expanded')).toBe(true);
    expect(secondTrigger.hasAttribute('aria-pressed')).toBe(false);
  });

  it('shows source metadata as compact badges and exposes the full title', () => {
    const sourced = { ...candidate, capabilityId: 'source.card', displayName: '一个很长的组件名称', sourceName: 'GTRONICK/QSS 基础控件' };
    render(<CapabilityCandidates candidates={[sourced]} />);
    expect(screen.getByTitle('一个很长的组件名称')).toBeTruthy();
    expect(screen.getByText('GTRONICK/QSS 基础控件').classList.contains('v3-capability-card__source')).toBe(true);
    expect(screen.queryByText(/来自 GTRONICK/)).toBeNull();
  });
});
