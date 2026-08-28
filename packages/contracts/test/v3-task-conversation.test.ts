import { describe, expect, it } from 'vitest';
import { V3TaskEventSchema, V3TaskSnapshotSchema } from '../src/index.js';

describe('V3 task conversation contracts', () => {
  it('accepts a sequenced status event', () => {
    expect(V3TaskEventSchema.parse({
      taskId: 'task-1', sequence: 3, timestamp: 1,
      type: 'status', status: 'completed', stage: 'validating_base_ui',
      title: 'uic 校验通过', lane: 'generation',
    })).toMatchObject({ taskId: 'task-1', sequence: 3 });
  });

  it('rejects missing event essentials and invalid sequences', () => {
    expect(() => V3TaskEventSchema.parse({ taskId: 'task-1', sequence: 0 })).toThrow();
    expect(() => V3TaskEventSchema.parse({
      taskId: 'task-1', sequence: 1, timestamp: 1, type: 'status', title: 'x', lane: 'generation', unexpected: true,
    })).toThrow();
  });

  it('keeps a bounded serializable task snapshot', () => {
    expect(V3TaskSnapshotSchema.parse({
      taskId: 'task-1', status: 'running', lastSequence: 3,
      createdAt: 1, updatedAt: 2,
      events: [{ taskId: 'task-1', sequence: 3, timestamp: 2, type: 'done', title: '完成', lane: 'generation' }],
    })).toMatchObject({ taskId: 'task-1', lastSequence: 3 });
  });
});
