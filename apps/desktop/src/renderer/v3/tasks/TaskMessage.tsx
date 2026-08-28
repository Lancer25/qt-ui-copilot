import type { TaskMessage as StreamMessage } from '../state/task-stream-store';

export function TaskMessage({ message }: { message: StreamMessage }) {
  return <article className="v3-task-message v3-task-message--assistant" aria-label="AI 回复">
    <span className="v3-task-message__author">AI</span>
    <p>{message.content}</p>
  </article>;
}
