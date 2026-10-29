import { describe, expect, it, vi } from 'vitest';
import { V3TaskEventService } from './v3-task-event-service';
import { openDatabase, V3Repository } from '@qt-ui-copilot/task-store';

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

  it('restores persisted events and exposes workspace-scoped history', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    const first = new V3TaskEventService(repository);
    first.beginTask('task-1', { workspaceId: 'workspace-1', title: '创建登录页', targetPath: 'ui/Login.ui' });
    first.append('task-1', { lane: 'conversation', type: 'done', status: 'completed', title: '完成' });

    const reopened = new V3TaskEventService(repository);
    expect(reopened.snapshot('task-1')?.events[0]?.title).toBe('完成');
    expect(reopened.list('workspace-1')).toEqual([expect.objectContaining({ taskId: 'task-1', title: '创建登录页', status: 'completed' })]);
    database.close();
  });

  it('keeps the task alive when the repository refuses a snapshot', () => {
    // Reproduced from the reported failure: a snapshot the schema rejected threw
    // from inside the task's own error handler, so the real failure surfaced as an
    // unhandled promise rejection and the task looked like it had crashed.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const repository = { reconcileInterruptedTasks: () => {}, getTaskSnapshot: () => undefined, getTaskHistoryItem: () => undefined, saveTaskSnapshot: () => { throw new Error('project paths must be relative'); } } as unknown as V3Repository;
    const service = new V3TaskEventService(repository);
    const listener = vi.fn();
    service.subscribe(listener);
    service.beginTask('task-1', { title: '创建主窗口' });
    service.append('task-1', { lane: 'generation', type: 'status', status: 'failed', title: '任务执行失败', detail: '构建失败' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.snapshot('task-1')?.events[0]?.detail).toBe('构建失败');
    // Reported once per task: a degraded history must not log per event.
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
