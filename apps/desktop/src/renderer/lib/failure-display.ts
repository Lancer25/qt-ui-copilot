import type { WorkflowUiState } from './api';

const MAX_FAILURE_MESSAGE_LENGTH = 512;
const MAX_FAILURE_CODE_LENGTH = 96;

/** Renderer-side defense in depth: Main never sends secrets, but UI text is still bounded and redacted. */
export function sanitizeFailureCode(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, MAX_FAILURE_CODE_LENGTH) || 'workflow_failed';
}

export function sanitizeFailureMessage(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|authorization)\s*[:=]\s*[^,\s}]+/gi, '$1: [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FAILURE_MESSAGE_LENGTH) || '工作流执行失败。';
}

export function formatWorkflowFailure(failure: WorkflowUiState['failure']): string | undefined {
  if (!failure) return undefined;
  return `${sanitizeFailureCode(failure.code)}: ${sanitizeFailureMessage(failure.message)}`;
}

