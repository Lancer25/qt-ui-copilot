import { useState } from 'react';
import type { UiCreationCandidate, V3StartTaskInput, V3TaskEvent } from '@qt-ui-copilot/contracts';
import { useTaskStream, type TaskStreamTask } from '../state/task-stream-store';
import { TaskArtifactCard } from './TaskArtifactCard';
import { TaskComposer, type TaskComposerInput } from './TaskComposer';
import { TaskMessage } from './TaskMessage';
import { TaskStatusLine } from './TaskStatusLine';
import './task-conversation.css';

export interface TaskConversationViewProps {
  taskId: string;
  createTaskInput?: (input: TaskComposerInput) => V3StartTaskInput;
  onOpenPreview?: (candidate: UiCreationCandidate) => void;
  onOpenDiff?: (candidate: UiCreationCandidate) => void;
  onCommitCandidate?: (candidateId: string) => Promise<void> | void;
  onRejectCandidate?: (candidateId: string) => Promise<void> | void;
}

const visibleStatus = (event: V3TaskEvent) => event.type !== 'message_delta' && event.type !== 'artifact' && event.type !== 'done';

export function TaskConversationView({ taskId, createTaskInput, onOpenPreview, onOpenDiff, onCommitCandidate, onRejectCandidate }: TaskConversationViewProps) {
  const controller = useTaskStream(taskId);
  const [composerError, setComposerError] = useState<string>();
  const task = controller.task;
  const running = task?.status === 'running' || task?.status === 'pending';
  const submit = async (input: TaskComposerInput) => {
    if (!createTaskInput) { setComposerError('当前任务尚未配置发送方式。'); return; }
    try {
      const request = createTaskInput(input);
      if (running) await controller.queueMessage(request);
      else await controller.startTask(request);
      setComposerError(undefined);
    } catch (error) { setComposerError(error instanceof Error ? error.message : String(error)); }
  };
  return <main className="v3-task-conversation" aria-label="AI 工作区">
    <header className="v3-task-conversation__header"><div><span>AI 任务</span><h1>{task?.status === 'running' ? '正在处理你的请求' : 'Qt UI Copilot'}</h1></div>{task?.status ? <span className={`v3-task-conversation__state is-${task.status}`}>{task.status === 'running' ? '处理中' : task.status === 'failed' ? '需要处理' : task.status === 'cancelled' ? '已停止' : '就绪'}</span> : null}</header>
    <div className="v3-task-conversation__feed" aria-live="polite">
      {!task?.events.length ? <section className="v3-task-conversation__empty"><b>开始一个 AI 任务</b><p>描述要创建或修改的 Qt 界面，或拖入一张参考图。</p></section> : <TaskFeed task={task} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onCommit={onCommitCandidate} onReject={onRejectCandidate} />}
      {composerError ? <p className="v3-task-conversation__error" role="alert">{composerError}</p> : null}
    </div>
    <TaskComposer running={running} queued={task?.queuedMessages.length} onSubmit={submit} onStop={() => controller.cancelTask()} />
  </main>;
}

function TaskFeed({ task, onOpenPreview, onOpenDiff, onCommit, onReject }: { task: TaskStreamTask; onOpenPreview?: (candidate: UiCreationCandidate) => void; onOpenDiff?: (candidate: UiCreationCandidate) => void; onCommit?: (candidateId: string) => Promise<void> | void; onReject?: (candidateId: string) => Promise<void> | void }) {
  const messagesByFinalDelta = new Map(task.messages.map((message) => [message.sequence, message]));
  return <>{task.events.map((event) => {
    if (event.type === 'message_delta') {
      const message = messagesByFinalDelta.get(event.sequence);
      return message ? <TaskMessage key={`message-${event.sequence}`} message={message} /> : null;
    }
    return visibleStatus(event) ? <TaskStatusLine key={event.sequence} event={event} /> : null;
  })}{task.candidate ? <TaskArtifactCard candidate={task.candidate} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onCommit={onCommit} onReject={onReject} /> : null}</>;
}
