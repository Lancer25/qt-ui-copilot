import { useEffect, useState } from 'react';
import type { UiCreationCandidate, V3StartTaskInput, V3TaskEvent } from '@qt-ui-copilot/contracts';
import { useTaskStream, type TaskStreamTask } from '../state/task-stream-store';
import { TaskArtifactCard } from './TaskArtifactCard';
import { TaskComposer, type TaskComposerInput } from './TaskComposer';
import { TaskMessage } from './TaskMessage';
import { TaskStatusLine } from './TaskStatusLine';
import './task-conversation.css';

export interface TaskConversationViewProps {
  taskId: string;
  createTaskInput?: (input: TaskComposerInput) => V3StartTaskInput | Promise<V3StartTaskInput>;
  onOpenPreview?: (candidate: UiCreationCandidate) => void;
  shouldAutoOpenCandidate?: (candidate: UiCreationCandidate) => boolean;
  creationMode?: boolean;
  onOpenDiff?: (candidate: UiCreationCandidate) => void;
  onCommitCandidate?: (candidateId: string) => Promise<void> | void;
  onRejectCandidate?: (candidateId: string) => Promise<void> | void;
  onOpenOutput?: (taskId: string) => void;
  componentCount?: number;
}

const visibleStatus = (event: V3TaskEvent) => event.type !== 'message_delta' && event.type !== 'artifact' && event.type !== 'done';

export function TaskConversationView({ taskId, createTaskInput, onOpenPreview, shouldAutoOpenCandidate, creationMode, onOpenDiff, onCommitCandidate, onRejectCandidate, onOpenOutput, componentCount }: TaskConversationViewProps) {
  const controller = useTaskStream(taskId);
  const [composerError, setComposerError] = useState<string>();
  const [lastRequest, setLastRequest] = useState<V3StartTaskInput>();
  const [composerSeed, setComposerSeed] = useState<{ id: number; text: string }>();
  const task = controller.task;
  const running = task?.status === 'running' || task?.status === 'pending';
  useEffect(() => { if (task?.candidate && (shouldAutoOpenCandidate?.(task.candidate) ?? true)) onOpenPreview?.(task.candidate); }, [task?.candidate?.id, task?.candidate?.saved, onOpenPreview, shouldAutoOpenCandidate]);
  const submit = async (input: TaskComposerInput) => {
    if (!createTaskInput) { setComposerError('当前任务尚未配置发送方式。'); return; }
    try {
      const request = await createTaskInput(input);
      setLastRequest(request);
      if (running) await controller.queueMessage(request);
      else await controller.startTask(request);
      setComposerError(undefined);
    } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); }
  };
  return <main className="v3-task-conversation" aria-label="AI 工作区">
    <header className="v3-task-conversation__header"><div><span>AI 任务</span><h1>{task?.status === 'running' ? '正在处理你的请求' : 'Qt UI Copilot'}</h1></div>{task?.status ? <span className={`v3-task-conversation__state is-${task.status}`}>{task.status === 'running' ? '处理中' : task.status === 'failed' ? '需要处理' : task.status === 'cancelled' ? '已停止' : '就绪'}</span> : null}</header>
    <div className="v3-task-conversation__feed" aria-live="polite">
      {!task?.events.length ? <section className="v3-task-conversation__empty"><span className="v3-task-conversation__eyebrow">QT UI COPILOT</span><b>开始一个 AI 任务</b><p>描述要创建或修改的 Qt 界面，或选择一个常用任务开始。</p><div className="v3-task-conversation__starters" aria-label="常用任务"><button type="button" onClick={() => setComposerSeed((current) => ({ id: (current?.id ?? 0) + 1, text: '创建一个结构清晰、视觉现代的登录页面。' }))}>创建登录页</button><button type="button" onClick={() => setComposerSeed((current) => ({ id: (current?.id ?? 0) + 1, text: '审查并优化当前 Qt 界面的布局、间距和视觉层级。' }))}>优化当前界面</button><button type="button" onClick={() => setComposerSeed((current) => ({ id: (current?.id ?? 0) + 1, text: '请编译并运行当前 Qt 应用，检查构建和启动结果。' }))}>编译运行项目</button></div></section> : <TaskFeed task={task} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onCommit={onCommitCandidate} onReject={onRejectCandidate} />}
      {task?.status === 'failed' ? <div className="v3-task-recovery" role="group" aria-label="任务恢复操作"><span>任务未完成，可以重新执行或查看详细日志。</span><div><button type="button" onClick={() => lastRequest ? void controller.startTask({ ...lastRequest, taskId }) : setComposerError('当前任务输入未恢复，请在下方重新描述后发送。')}>{lastRequest ? '重新执行' : '重新输入'}</button><button type="button" onClick={() => onOpenOutput?.(taskId)}>查看日志</button></div></div> : null}
      {composerError ? <p className="v3-task-conversation__error" role="alert">{composerError}</p> : null}
    </div>
    <TaskComposer running={running} queued={task?.queuedMessages.length} creationMode={creationMode} seed={composerSeed} componentCount={componentCount} onSubmit={submit} onStop={() => controller.cancelTask()} />
  </main>;
}

function TaskFeed({ task, onOpenPreview, onOpenDiff, onCommit, onReject }: { task: TaskStreamTask; onOpenPreview?: (candidate: UiCreationCandidate) => void; onOpenDiff?: (candidate: UiCreationCandidate) => void; onCommit?: (candidateId: string) => Promise<void> | void; onReject?: (candidateId: string) => Promise<void> | void }) {
  const messagesByFinalDelta = new Map(task.messages.map((message) => [message.sequence, message]));
  return <>{task.events.map((event) => {
    if (event.stage === 'user_message') return <article key={event.sequence} className="v3-task-message" aria-label="你的消息"><b>你</b><p style={{ whiteSpace: 'pre-wrap' }}>{event.detail}</p></article>;
    if (event.type === 'message_delta') {
      const message = messagesByFinalDelta.get(event.sequence);
      return message ? <TaskMessage key={`message-${event.sequence}`} message={message} /> : null;
    }
    if (!visibleStatus(event)) return null;
    const hasLaterEvent = task.events.some((next) => next.sequence > event.sequence && (next.type === 'status' || next.type === 'error' || next.type === 'cancelled' || next.type === 'done'));
    const projected = task.status === 'cancelled' && event.status !== 'completed'
      ? { ...event, status: 'cancelled' as const, title: event.title.startsWith('已取消') ? event.title : `已取消：${event.title}` }
      : event.status === 'running' && hasLaterEvent
        ? { ...event, status: 'completed' as const, title: event.title }
        : event;
    return <TaskStatusLine key={event.sequence} event={projected} />;
  })}{task.candidate ? <TaskArtifactCard candidate={task.candidate} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onCommit={onCommit} onReject={onReject} /> : null}</>;
}
