// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import { TaskStreamProvider } from '../state/task-stream-store';
import { TaskArtifactCard } from './TaskArtifactCard';
import { TaskConversationView } from './TaskConversationView';

const taskId = 'task-conversation';
const api = {
  ai: {
    onTaskEvent: () => () => undefined,
    getTaskSnapshot: vi.fn(async () => ({
      taskId,
      status: 'running',
      lastSequence: 4,
      createdAt: 1,
      updatedAt: 4,
      events: [
        { taskId, sequence: 1, timestamp: 1, lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '我已理解你的需求。' },
        { taskId, sequence: 2, timestamp: 2, lane: 'generation', type: 'status', status: 'completed', title: '基础 UI 已生成', detail: 'uic 校验通过' },
        { taskId, sequence: 3, timestamp: 3, lane: 'preview', type: 'status', status: 'running', title: '正在生成实际预览…', detail: 'PreviewHost 正在启动' },
        { taskId, sequence: 4, timestamp: 4, lane: 'conversation', type: 'message_delta', title: 'AI 回复', detail: '基础界面已准备好，接下来完成预览。' },
      ],
    })),
    startTaskStream: vi.fn(async () => ({ taskId })),
    cancelTaskStream: vi.fn(async () => undefined),
  },
} as unknown as DesktopApi;

function renderView(props: Partial<React.ComponentProps<typeof TaskConversationView>> = {}) {
  return render(<TaskStreamProvider api={api}><TaskConversationView taskId={taskId} createTaskInput={(payload) => ({ kind: 'create', request: { workspaceId: 'workspace', contextMode: payload.contextMode, requirement: payload.text, attachments: payload.attachments, fileName: 'NewWidget.ui', rootType: 'QWidget', directory: 'ui', qtKitId: 'kit', useProjectResources: true, useComponentLibrary: true, capabilityCandidates: [] } })} {...props} /></TaskStreamProvider>);
}

describe('TaskConversationView', () => {
  afterEach(() => cleanup());

  it('renders readable streamed messages and hides technical details by default', async () => {
    renderView();
    expect(await screen.findByText('基础 UI 已生成')).toBeTruthy();
    expect(screen.getByText('我已理解你的需求。')).toBeTruthy();
    expect(screen.getByText('基础界面已准备好，接下来完成预览。')).toBeTruthy();
    expect(screen.getByText('正在生成实际预览…').closest('.v3-task-status')?.className.includes('is-running')).toBe(true);
    expect(screen.queryByText('PreviewHost 正在启动')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '查看详情：正在生成实际预览…' }));
    expect(screen.getByText('PreviewHost 正在启动')).toBeTruthy();
  });

  it('queues input while running and exposes a stop action', async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByText('基础 UI 已生成');
    await user.type(screen.getByRole('textbox', { name: '发送给 AI' }), '再把按钮做圆一些');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(screen.getByText('已加入队列')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '停止当前任务' }));
    expect(api.ai!.cancelTaskStream).toHaveBeenCalledWith(taskId);
  });

  it('shows an actionable candidate artifact without embedding a tiny preview', async () => {
    const user = userEvent.setup(); const onOpenPreview = vi.fn(); const onCommit = vi.fn();
    render(<TaskArtifactCard candidate={{
      id: 'candidate-1', workspaceId: 'workspace', targetPath: 'D:/demo/ui/NewWidget.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1,
      blueprint: { fileName: 'NewWidget.ui', rootType: 'QWidget', rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 320, height: 240 }, layoutTree: { kind: 'widget', className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['可以显示窗口'] },
      validation: { xml: true, semantic: true, uic: true, preview: false, findings: [] },
    }} onOpenPreview={onOpenPreview} onCommit={onCommit} />);
    expect(screen.getByText('待审批')).toBeTruthy();
    expect(screen.getByText(/预览待生成/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开预览' }));
    await user.click(screen.getByRole('button', { name: '审批并保存' }));
    expect(onOpenPreview).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('candidate-1');
  });

  it('automatically opens a restored candidate in the full preview tab', async () => {
    const candidate = {
      id: 'candidate-auto', workspaceId: 'workspace', targetPath: 'D:/demo/ui/NewWidget.ui', source: '<ui/>', sourceHash: 'a'.repeat(64), createdAt: 1,
      blueprint: { fileName: 'NewWidget.ui', rootType: 'QWidget' as const, rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 320, height: 240 }, layoutTree: { kind: 'widget' as const, className: 'QWidget', objectName: 'widget', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['可以显示窗口'] },
      validation: { xml: true, semantic: true, uic: true, preview: false, findings: [] },
    };
    const candidateApi = {
      ai: {
        ...api.ai,
        getTaskSnapshot: vi.fn(async () => ({
          taskId, status: 'running' as const, lastSequence: 1, createdAt: 1, updatedAt: 1,
          events: [{ taskId, sequence: 1, timestamp: 1, lane: 'generation' as const, type: 'artifact' as const, status: 'completed' as const, title: '基础 UI 已生成', artifact: { kind: 'candidate' as const, id: candidate.id, filePath: candidate.targetPath } }],
          candidate,
        })),
      },
    } as unknown as DesktopApi;
    const onOpenPreview = vi.fn();
    render(<TaskStreamProvider api={candidateApi}><TaskConversationView taskId={taskId} onOpenPreview={onOpenPreview} /></TaskStreamProvider>);
    await screen.findByText('NewWidget.ui');
    expect(onOpenPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'candidate-auto' }));
  });

  it('projects unfinished progress steps as cancelled after task cancellation', async () => {
    const cancelledApi = { ai: { ...api.ai, getTaskSnapshot: vi.fn(async () => ({ taskId, status: 'cancelled' as const, lastSequence: 3, createdAt: 1, updatedAt: 3, events: [
      { taskId, sequence: 1, timestamp: 1, lane: 'generation' as const, type: 'status' as const, status: 'running' as const, title: '正在准备项目上下文' },
      { taskId, sequence: 2, timestamp: 2, lane: 'generation' as const, type: 'status' as const, status: 'running' as const, title: '正在生成基础界面意图' },
      { taskId, sequence: 3, timestamp: 3, lane: 'conversation' as const, type: 'cancelled' as const, status: 'cancelled' as const, title: '任务已取消' },
    ] })) } } as unknown as DesktopApi;
    render(<TaskStreamProvider api={cancelledApi}><TaskConversationView taskId={taskId} /></TaskStreamProvider>);
    expect(await screen.findByText('已取消：正在准备项目上下文')).toBeTruthy();
    expect(screen.getByText('已取消：正在生成基础界面意图')).toBeTruthy();
  });

  it('offers retry and log actions when the current task fails', async () => {
    const user = userEvent.setup();
    const startTaskStream = vi.fn(async () => ({ taskId }));
    let emit: ((event: any) => void) | undefined;
    const failedApi = { ai: { ...api.ai, onTaskEvent: vi.fn((listener) => { emit = listener; return () => undefined; }), startTaskStream, getTaskSnapshot: vi.fn(async () => ({ taskId, status: 'failed' as const, lastSequence: 1, createdAt: 1, updatedAt: 1, events: [{ taskId, sequence: 1, timestamp: 1, lane: 'generation' as const, type: 'error' as const, status: 'failed' as const, title: '任务执行失败', detail: '模型响应无效' }] })) } } as unknown as DesktopApi;
    const onOpenOutput = vi.fn();
    render(<TaskStreamProvider api={failedApi}><TaskConversationView taskId={taskId} createTaskInput={(payload) => ({ kind: 'create', request: { workspaceId: 'workspace', contextMode: payload.contextMode, requirement: payload.text, attachments: payload.attachments, fileName: 'NewWidget.ui', rootType: 'QWidget', directory: 'ui', qtKitId: 'kit', useProjectResources: true, useComponentLibrary: true, capabilityCandidates: [] } })} onOpenOutput={onOpenOutput} /></TaskStreamProvider>);
    await screen.findByText('任务执行失败');
    await user.click(screen.getByRole('button', { name: '查看日志' }));
    expect(onOpenOutput).toHaveBeenCalledWith(taskId);
    await user.type(screen.getByRole('textbox', { name: '发送给 AI' }), '重试');
    await user.click(screen.getByRole('button', { name: '发送' }));
    emit?.({ taskId, sequence: 2, timestamp: 2, lane: 'generation', type: 'status', status: 'running', title: '重新执行中' });
    expect(startTaskStream).toHaveBeenCalled();
  });
});
