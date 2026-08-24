// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowUiState } from '../../lib/api';
import { WorkflowTimeline } from './WorkflowTimeline';

const callbacks = { onTakeOver: vi.fn(), onCancel: vi.fn(), onAccept: vi.fn(), onRollback: vi.fn() };

afterEach(cleanup);

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

  it('shows verification badges only for completed verification events', () => {
    const state: WorkflowUiState = {
      taskId: 'task-2', targetUi: 'Settings.ui', status: 'completed', node: 'REPORT',
      events: [
        { node: 'UIC_VALIDATE', status: 'completed' },
        { node: 'CAPTURE_REAL_RESULT', status: 'completed' },
      ],
      deterministicFindings: [], visualFindings: [], routeEvidence: [],
    };

    render(<WorkflowTimeline task={state} {...callbacks} />);

    expect(screen.getByText('uic 校验通过')).not.toBeNull();
    expect(screen.getByText('真实应用验证通过')).not.toBeNull();
  });

  it('shows failure badges for failed verification events instead of pass badges', () => {
    const state: WorkflowUiState = {
      taskId: 'task-3', targetUi: 'Settings.ui', status: 'failed', node: 'CAPTURE_REAL_RESULT',
      events: [
        { node: 'UIC_VALIDATE', status: 'failed', detail: 'uic rejected candidate' },
        { node: 'CAPTURE_REAL_RESULT', status: 'failed', detail: 'target page not found' },
      ],
      deterministicFindings: [], visualFindings: [], routeEvidence: [],
    };

    render(<WorkflowTimeline task={state} {...callbacks} />);

    expect(screen.getByText('uic 校验失败')).not.toBeNull();
    expect(screen.getByText('真实应用验证失败')).not.toBeNull();
    expect(screen.queryByText('uic 校验通过')).toBeNull();
    expect(screen.queryByText('真实应用验证通过')).toBeNull();
  });
});
