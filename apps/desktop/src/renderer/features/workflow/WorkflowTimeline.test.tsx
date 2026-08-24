// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowUiState } from '../../lib/api';
import { WorkflowTimeline } from './WorkflowTimeline';

const callbacks = { onTakeOver: vi.fn(), onCancel: vi.fn(), onAccept: vi.fn(), onRollback: vi.fn() };

describe('WorkflowTimeline failure visibility', () => {
  it('renders a failed node as a bounded, redacted timeline item', () => {
    const state: WorkflowUiState = {
      taskId: 'task-1', targetUi: 'Settings.ui', status: 'failed', node: 'GENERATE_UI_PLAN',
      events: [{ node: 'GENERATE_UI_PLAN', status: 'failed', detail: `Bearer secret-token ${'x'.repeat(600)}` }],
      deterministicFindings: [], visualFindings: [], routeEvidence: [],
      failure: { code: 'model_output_invalid', message: 'planner failed' },
    };

    render(<WorkflowTimeline task={state} {...callbacks} />);

    const item = screen.getByRole('listitem', { name: /GENERATE_UI_PLAN failed/ });
    expect(item.textContent).toContain('Bearer [REDACTED]');
    expect(item.textContent?.length ?? 0).toBeLessThan(600);
  });
});

