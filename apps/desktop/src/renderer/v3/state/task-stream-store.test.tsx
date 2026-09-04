// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import type { V3TaskEvent, V3TaskSnapshot } from '@qt-ui-copilot/contracts';
import { TaskStreamProvider, useTaskStream } from './task-stream-store';

const event = (sequence: number, overrides: Partial<V3TaskEvent> = {}): V3TaskEvent => ({
  taskId: 'task-1', sequence, timestamp: sequence, lane: 'generation', type: 'status', status: 'running', title: `step ${sequence}`, ...overrides,
});

const snapshot = (events: V3TaskEvent[] = []): V3TaskSnapshot => ({
  taskId: 'task-1', status: 'running', lastSequence: events.at(-1)?.sequence ?? 0, events, createdAt: 1, updatedAt: 2,
});

const candidate = {
  id: 'candidate-1', workspaceId: 'w', targetPath: 'D:/demo/ui/NewWidget.ui', source: '<ui version="4.0"/>', sourceHash: 'a'.repeat(64), createdAt: 1,
  blueprint: { fileName: 'NewWidget.ui', rootType: 'QWidget' as const, rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'widget' as const, className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['renders'] },
  validation: { xml: true, semantic: true, uic: true, preview: true, findings: [] },
};

describe('TaskStreamStore', () => {
  it('rejects stale events so a task never moves backwards', async () => {
    let emit: ((value: V3TaskEvent) => void) | undefined;
    const api = { ai: { onTaskEvent: vi.fn((listener) => { emit = listener; return () => undefined; }), getTaskSnapshot: vi.fn(async () => undefined) } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });

    act(() => emit?.(event(8, { stage: 'preview_ready', status: 'completed' })));
    act(() => emit?.(event(6, { stage: 'validating_base_ui', status: 'running' })));

    expect(result.current.task?.lastSequence).toBe(8);
    expect(result.current.task?.events).toHaveLength(1);
    expect(result.current.task?.events[0]?.stage).toBe('preview_ready');
  });

  it('restores snapshots and merges message deltas into one assistant message', async () => {
    const api = { ai: { onTaskEvent: vi.fn(() => () => undefined), getTaskSnapshot: vi.fn(async () => ({ ...snapshot([
      event(1, { lane: 'conversation', type: 'message_delta', title: 'AI 正在分析', detail: '第一段' }),
      event(2, { lane: 'conversation', type: 'message_delta', title: 'AI 正在分析', detail: '第二段' }),
    ]), candidate, preview: { status: 'completed' as const, mode: 'quick' as const, imageDataUrl: 'data:image/png;base64,AA==' } })) } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });

    await waitFor(() => expect(result.current.task?.lastSequence).toBe(2));
    expect(result.current.task?.messages).toEqual([{ role: 'assistant', content: '第一段第二段', sequence: 2 }]);
    expect(result.current.task?.candidate?.id).toBe('candidate-1');
    expect(result.current.task?.preview?.status).toBe('completed');
  });

  it('preserves earlier assistant turns when a status separates streamed deltas', async () => {
    const api = { ai: { onTaskEvent: vi.fn(() => () => undefined), getTaskSnapshot: vi.fn(async () => snapshot([
      event(1, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '先分析布局。' }),
      event(2, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '然后创建控件。' }),
      event(3, { type: 'status', status: 'completed', title: '基础 UI 已生成' }),
      event(4, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '接下来验证预览。' }),
      event(5, { lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '预览将稍后显示。' }),
    ])) } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });

    await waitFor(() => expect(result.current.task?.lastSequence).toBe(5));
    expect(result.current.task?.messages).toEqual([
      { role: 'assistant', content: '先分析布局。然后创建控件。', sequence: 2 },
      { role: 'assistant', content: '接下来验证预览。预览将稍后显示。', sequence: 5 },
    ]);
  });

  it('queues a new request while running, starts it after done, and cancels through the API', async () => {
    let emit: ((value: V3TaskEvent) => void) | undefined;
    const startTaskStream = vi.fn(async () => ({ taskId: 'task-1' }));
    const cancelTaskStream = vi.fn(async () => undefined);
    const api = { ai: { onTaskEvent: vi.fn((listener) => { emit = listener; return () => undefined; }), getTaskSnapshot: vi.fn(async () => undefined), startTaskStream, cancelTaskStream } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });
    const request = { kind: 'create' as const, request: { workspaceId: 'w', contextMode: 'focused_ui' as const, requirement: 'next', attachments: [], fileName: 'Next.ui', rootType: 'QWidget' as const, directory: 'ui', qtKitId: 'kit', useProjectResources: true, useComponentLibrary: true, capabilityCandidates: [] } };

    act(() => emit?.(event(1)));
    await act(async () => { await result.current.queueMessage(request); });
    expect(result.current.task?.queuedMessages).toHaveLength(1);
    act(() => emit?.(event(2, { type: 'done', status: 'completed', title: '完成' })));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith({ ...request, taskId: 'task-1' }));
    await act(async () => { await result.current.cancelTask(); });
    expect(cancelTaskStream).toHaveBeenCalledWith('task-1');
  });

  it('keeps queued work after cancellation until the user explicitly continues it', async () => {
    let emit: ((value: V3TaskEvent) => void) | undefined;
    const startTaskStream = vi.fn(async () => ({ taskId: 'task-1' }));
    const cancelTaskStream = vi.fn(async () => undefined);
    const api = { ai: { onTaskEvent: vi.fn((listener) => { emit = listener; return () => undefined; }), getTaskSnapshot: vi.fn(async () => undefined), startTaskStream, cancelTaskStream } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });
    const request = { kind: 'create' as const, request: { workspaceId: 'w', contextMode: 'focused_ui' as const, requirement: 'retry', attachments: [], fileName: 'Retry.ui', rootType: 'QWidget' as const, directory: 'ui', qtKitId: 'kit', useProjectResources: true, useComponentLibrary: true, capabilityCandidates: [] } };

    act(() => emit?.(event(1)));
    await act(async () => { await result.current.queueMessage(request); await result.current.cancelTask(); });
    act(() => emit?.(event(2, { type: 'cancelled', status: 'cancelled', title: '取消' })));
    expect(result.current.task?.queuedMessages).toEqual([request]);
    expect(startTaskStream).not.toHaveBeenCalled();
    await act(async () => { await result.current.continueTask(); });
    expect(startTaskStream).toHaveBeenCalledWith({ ...request, taskId: 'task-1' });
    expect(result.current.task?.queuedMessages).toEqual([]);
  });

  it('queues preview adjustments on a running task and starts the same task when idle', async () => {
    let emit: ((value: V3TaskEvent) => void) | undefined;
    const startTaskStream = vi.fn(async () => ({ taskId: 'task-1' }));
    const api = { ai: { onTaskEvent: vi.fn((listener) => { emit = listener; return () => undefined; }), getTaskSnapshot: vi.fn(async () => undefined), startTaskStream } } as unknown as DesktopApi;
    const wrapper = ({ children }: { children: React.ReactNode }) => <TaskStreamProvider api={api}>{children}</TaskStreamProvider>;
    const { result } = renderHook(() => useTaskStream('task-1'), { wrapper });
    const adjustment = { taskId: 'task-1', uiFile: 'ui/Main.ui', uiContent: '<ui/>', requirement: '把按钮改成蓝色', contextMode: 'focused_ui' as const, previewDataUrl: 'data:image/png;base64,AA==' };

    act(() => emit?.(event(1)));
    await act(async () => { await result.current.adjustTask(adjustment); });
    expect(result.current.task?.queuedMessages).toEqual([{ kind: 'adjust', taskId: 'task-1', request: adjustment }]);

    act(() => emit?.(event(2, { type: 'done', status: 'completed', title: '完成' })));
    await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith({ kind: 'adjust', taskId: 'task-1', request: adjustment }));
  });
});
