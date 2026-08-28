import { describe, expect, it, vi } from 'vitest';
import { V3TaskEventService } from './v3-task-event-service';

describe('V3TaskEventService', () => {
  it('allocates monotonic sequences and exposes a bounded serializable snapshot', () => {
    const service = new V3TaskEventService();
    service.append('task-1', { lane: 'generation', type: 'status', status: 'running', title: '生成基础 UI' });
    service.append('task-1', { lane: 'generation', type: 'status', status: 'completed', title: '基础 UI 已生成' });

    expect(service.snapshot('task-1')).toMatchObject({ taskId: 'task-1', lastSequence: 2 });
    expect(service.snapshot('task-1')?.events.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('notifies subscribers with each immutable event and keeps only the most recent 200', () => {
    const service = new V3TaskEventService();
    const listener = vi.fn();
    const dispose = service.subscribe(listener);
    for (let index = 0; index < 201; index += 1) service.append('task-1', { lane: 'conversation', type: 'message_delta', title: '模型输出', detail: String(index) });

    expect(listener).toHaveBeenCalledTimes(201);
    expect(service.snapshot('task-1')?.events).toHaveLength(200);
    expect(service.snapshot('task-1')?.events[0]?.sequence).toBe(2);
    dispose();
  });

  it('stores candidate and preview facts on the task snapshot', () => {
    const service = new V3TaskEventService();
    service.append('task-1', { lane: 'generation', type: 'status', status: 'running', title: '生成中' });
    service.setCandidate('task-1', {
      id: 'candidate-1', workspaceId: 'workspace-1', targetPath: 'D:/demo/Main.ui', source: '<ui/>', sourceHash: 'hash',
      blueprint: { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'Main', windowTitle: 'Main', size: { width: 800, height: 600 }, layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'layout', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: [] },
      validation: { xml: true, semantic: true, uic: true, preview: false, findings: [] }, createdAt: 1,
    });
    service.setPreview('task-1', { status: 'completed', imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' });
    service.updateCandidate('task-1', (candidate) => ({ ...candidate, previewDataUrl: 'data:image/png;base64,AA==', validation: { ...candidate.validation, preview: true } }));

    expect(service.snapshot('task-1')).toMatchObject({ candidate: { id: 'candidate-1', validation: { preview: true } }, preview: { status: 'completed' } });
  });
});
