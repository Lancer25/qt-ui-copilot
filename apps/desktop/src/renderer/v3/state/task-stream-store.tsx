import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { UiCreationCandidate, V3StartTaskInput, V3TaskArtifact, V3TaskEvent, V3TaskPreview, V3TaskSnapshot } from '@qt-ui-copilot/contracts';
import { desktopApi, type DesktopApi } from '../../lib/api';

const MAX_EVENTS = 200;

export type TaskMessage = { role: 'assistant'; content: string; sequence: number };

/** Renderer-owned projection of a Main-process task snapshot. */
export interface TaskStreamTask {
  taskId: string;
  status: V3TaskSnapshot['status'];
  lastSequence: number;
  events: V3TaskEvent[];
  messages: TaskMessage[];
  artifacts: V3TaskArtifact[];
  candidate?: UiCreationCandidate;
  preview?: V3TaskPreview;
  queuedMessages: V3StartTaskInput[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskStreamState { tasks: Record<string, TaskStreamTask | undefined>; }
export const initialTaskStreamState: TaskStreamState = { tasks: {} };

type TaskStreamAction =
  | { type: 'accept'; event: V3TaskEvent }
  | { type: 'snapshot'; snapshot: V3TaskSnapshot }
  | { type: 'enqueue'; taskId: string; input: V3StartTaskInput }
  | { type: 'dequeue'; taskId: string };

const emptyTask = (taskId: string, timestamp = Date.now()): TaskStreamTask => ({
  taskId, status: 'pending', lastSequence: 0, events: [], messages: [], artifacts: [], queuedMessages: [], createdAt: timestamp, updatedAt: timestamp,
});

function statusAfter(current: V3TaskSnapshot['status'], event: V3TaskEvent): V3TaskSnapshot['status'] {
  if (event.type === 'cancelled' || event.status === 'cancelled') return 'cancelled';
  if (event.type === 'error' || event.status === 'failed') return 'failed';
  if (event.type === 'done') return 'completed';
  if (event.status === 'warning') return 'warning';
  if (event.status === 'completed') return current === 'pending' ? 'completed' : current;
  return event.status === 'pending' ? 'pending' : 'running';
}

/** One canonical reducer path for both live IPC events and restored snapshots. */
export function acceptTaskEvent(task: TaskStreamTask, event: V3TaskEvent): TaskStreamTask {
  if (event.taskId !== task.taskId || event.sequence <= task.lastSequence) return task;
  const events = [...task.events, event];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const artifacts = event.artifact
    ? [...task.artifacts.filter((item) => `${item.kind}:${item.id}` !== `${event.artifact!.kind}:${event.artifact!.id}`), event.artifact]
    : task.artifacts;
  const messages = event.type === 'message_delta' && event.detail
    ? (() => {
      const last = task.messages.at(-1);
      // A status/artifact boundary starts a new assistant turn; only adjacent
      // deltas belong to the same streamed message.
      const continuesPreviousTurn = task.events.at(-1)?.type === 'message_delta';
      return last && continuesPreviousTurn
        ? [...task.messages.slice(0, -1), { ...last, content: `${last.content}${event.detail}`, sequence: event.sequence }]
        : [...task.messages, { role: 'assistant' as const, content: event.detail, sequence: event.sequence }];
    })()
    : task.messages;
  return { ...task, lastSequence: event.sequence, events, messages, artifacts, ...(event.artifact?.candidate ? { candidate: event.artifact.candidate } : {}), status: statusAfter(task.status, event), updatedAt: event.timestamp };
}

function applySnapshot(current: TaskStreamTask | undefined, snapshot: V3TaskSnapshot): TaskStreamTask {
  let next = current ?? emptyTask(snapshot.taskId, snapshot.createdAt);
  for (const event of [...snapshot.events].sort((left, right) => left.sequence - right.sequence)) next = acceptTaskEvent(next, event);
  // A snapshot can legitimately contain no events (for example, a task that
  // was created then cancelled before its first model call). Do not let an
  // older snapshot overwrite a newer live event.
  if (snapshot.lastSequence >= next.lastSequence) {
    next = {
      ...next,
      status: snapshot.status,
      lastSequence: Math.max(next.lastSequence, snapshot.lastSequence),
      ...(snapshot.candidate ? { candidate: snapshot.candidate } : {}),
      ...(snapshot.preview ? { preview: snapshot.preview } : {}),
      createdAt: Math.min(next.createdAt, snapshot.createdAt),
      updatedAt: Math.max(next.updatedAt, snapshot.updatedAt),
    };
  }
  return next;
}

export function taskStreamReducer(state: TaskStreamState, action: TaskStreamAction): TaskStreamState {
  if (action.type === 'accept') {
    const current = state.tasks[action.event.taskId] ?? emptyTask(action.event.taskId, action.event.timestamp);
    const next = acceptTaskEvent(current, action.event);
    return next === current ? state : { ...state, tasks: { ...state.tasks, [next.taskId]: next } };
  }
  if (action.type === 'snapshot') {
    const next = applySnapshot(state.tasks[action.snapshot.taskId], action.snapshot);
    return { ...state, tasks: { ...state.tasks, [next.taskId]: next } };
  }
  const current = state.tasks[action.taskId] ?? emptyTask(action.taskId);
  if (action.type === 'enqueue') {
    const next = { ...current, queuedMessages: [...current.queuedMessages, action.input] };
    return { ...state, tasks: { ...state.tasks, [action.taskId]: next } };
  }
  const next = { ...current, queuedMessages: current.queuedMessages.slice(1) };
  return { ...state, tasks: { ...state.tasks, [action.taskId]: next } };
}

export interface TaskStreamController {
  task?: TaskStreamTask;
  startTask(input: V3StartTaskInput): Promise<string>;
  queueMessage(input: V3StartTaskInput): Promise<void>;
  /** Explicit user action after cancellation; queued work never resumes itself. */
  continueTask(): Promise<void>;
  cancelTask(): Promise<void>;
}

interface TaskStreamContextValue {
  state: TaskStreamState;
  accept(event: V3TaskEvent): void;
  restore(taskId: string): Promise<void>;
  startTask(input: V3StartTaskInput): Promise<string>;
  queueMessage(taskId: string, input: V3StartTaskInput): Promise<void>;
  continueTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
}

const TaskStreamContext = createContext<TaskStreamContextValue | undefined>(undefined);

export function TaskStreamProvider({ api = desktopApi(), children }: { api?: DesktopApi; children: ReactNode }) {
  const [state, dispatch] = useReducer(taskStreamReducer, initialTaskStreamState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const accept = useCallback((event: V3TaskEvent) => {
    const current = stateRef.current.tasks[event.taskId];
    if (current && event.sequence <= current.lastSequence) return;
    dispatch({ type: 'accept', event });
    if (event.type === 'done' && current?.queuedMessages.length) {
      const queued = current.queuedMessages[0]!;
      dispatch({ type: 'dequeue', taskId: event.taskId });
      void api.ai?.startTaskStream({ ...queued, taskId: event.taskId });
    }
  }, [api]);

  useEffect(() => api.ai?.onTaskEvent(accept), [api, accept]);

  const restore = useCallback(async (taskId: string) => {
    const snapshot = await api.ai?.getTaskSnapshot(taskId);
    if (snapshot) dispatch({ type: 'snapshot', snapshot });
  }, [api]);

  const startTask = useCallback(async (input: V3StartTaskInput) => {
    if (!api.ai) throw new Error('当前环境不支持 AI 任务流');
    const result = await api.ai.startTaskStream(input);
    await restore(result.taskId);
    return result.taskId;
  }, [api, restore]);

  const queueMessage = useCallback(async (taskId: string, input: V3StartTaskInput) => {
    const task = stateRef.current.tasks[taskId];
    if (task?.status === 'pending' || task?.status === 'running') {
      dispatch({ type: 'enqueue', taskId, input });
      return;
    }
    await startTask({ ...input, taskId });
  }, [startTask]);

  const cancelTask = useCallback(async (taskId: string) => {
    await api.ai?.cancelTaskStream(taskId);
  }, [api]);

  const continueTask = useCallback(async (taskId: string) => {
    const input = stateRef.current.tasks[taskId]?.queuedMessages[0];
    if (!input || !api.ai) return;
    // Dequeue only after Main has accepted the resumed request. A rejected
    // request remains visible to the user and can be retried safely.
    await api.ai.startTaskStream({ ...input, taskId });
    dispatch({ type: 'dequeue', taskId });
    await restore(taskId);
  }, [api, restore]);

  const value = useMemo(() => ({ state, accept, restore, startTask, queueMessage, continueTask, cancelTask }), [state, accept, restore, startTask, queueMessage, continueTask, cancelTask]);
  return <TaskStreamContext.Provider value={value}>{children}</TaskStreamContext.Provider>;
}

export function useTaskStream(taskId: string | undefined): TaskStreamController {
  const context = useContext(TaskStreamContext);
  if (!context) throw new Error('useTaskStream must be used inside TaskStreamProvider');
  useEffect(() => { if (taskId) void context.restore(taskId); }, [taskId, context.restore]);
  return useMemo(() => ({
    task: taskId ? context.state.tasks[taskId] : undefined,
    startTask: context.startTask,
    queueMessage: async (input) => {
      if (!taskId) throw new Error('没有可排队的任务');
      await context.queueMessage(taskId, input);
    },
    continueTask: async () => { if (taskId) await context.continueTask(taskId); },
    cancelTask: async () => { if (taskId) await context.cancelTask(taskId); },
  }), [taskId, context]);
}
