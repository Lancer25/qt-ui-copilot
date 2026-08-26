import { describe, expect, it } from 'vitest';
import { UiCreationStreamEventSchema, UiCreationTaskSnapshotSchema } from '../src/index.js';

describe('UI creation stream contracts', () => {
  it('accepts the structured generation and preview events', () => {
    expect(UiCreationStreamEventSchema.parse({
      taskId: 'task-1', sequence: 1, timestamp: Date.now(), lane: 'generation',
      type: 'completed', stage: 'base_candidate_ready', title: '基础候选已就绪', elapsedMs: 42,
    })).toMatchObject({ lane: 'generation', stage: 'base_candidate_ready' });
  });

  it('bounds details and accepts a resumable snapshot', () => {
    const snapshot = UiCreationTaskSnapshotSchema.parse({
      taskId: 'task-1', status: 'base_ready', generationStatus: 'ready',
      baseCandidate: { sourceHash: 'a'.repeat(64), uicPassed: true, readyAt: Date.now() },
      preview: { status: 'running', findings: [] }, lastSequence: 8,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    expect(snapshot.preview.status).toBe('running');
    expect(() => UiCreationStreamEventSchema.parse({
      taskId: 'task-1', sequence: 2, timestamp: Date.now(), lane: 'preview', type: 'progress',
      stage: 'rendering_preview', title: '渲染', detail: 'x'.repeat(2049),
    })).toThrow();
  });
});
