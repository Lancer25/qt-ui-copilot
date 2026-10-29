import type { UiCreationCandidate, V3TaskEvent, V3TaskHistoryItem, V3TaskPreview, V3TaskSnapshot } from '@qt-ui-copilot/contracts';
import type { V3Repository } from '@qt-ui-copilot/task-store';

const MAX_EVENTS = 200;

export type V3TaskEventDraft = Omit<V3TaskEvent, 'taskId' | 'sequence' | 'timestamp'>;
type Subscriber = (event: V3TaskEvent) => void;

interface TaskRecord {
  taskId: string;
  status: V3TaskSnapshot['status'];
  lastSequence: number;
  events: V3TaskEvent[];
  candidate?: UiCreationCandidate;
  preview?: V3TaskPreview;
  createdAt: number;
  updatedAt: number;
  workspaceId?: string;
  title: string;
  targetPath?: string;
}

export interface V3TaskMetadata { workspaceId?: string; title: string; targetPath?: string }

/**
 * Main-process source of truth for resumable V3 task activity. Renderer code
 * only observes events and snapshots emitted from this service.
 */
export class V3TaskEventService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly subscribers = new Set<Subscriber>();
  /** Tasks whose history this repository refuses, so the failure is reported once. */
  private readonly unpersistedTasks = new Set<string>();

  public constructor(private readonly repository?: V3Repository) {
    this.repository?.reconcileInterruptedTasks();
  }

  beginTask(taskId: string, metadata: V3TaskMetadata): void {
    const record = this.ensure(taskId);
    record.workspaceId = metadata.workspaceId ?? record.workspaceId;
    record.title = metadata.title;
    record.targetPath = metadata.targetPath ?? record.targetPath;
    record.updatedAt = Date.now();
    this.persist(record);
  }

  append(taskId: string, draft: V3TaskEventDraft): V3TaskEvent {
    const record = this.ensure(taskId);
    const event: V3TaskEvent = { ...draft, taskId, sequence: record.lastSequence + 1, timestamp: Date.now() };
    record.lastSequence = event.sequence;
    record.events.push(event);
    if (record.events.length > MAX_EVENTS) record.events.splice(0, record.events.length - MAX_EVENTS);
    record.status = statusAfter(record.status, event);
    record.updatedAt = event.timestamp;
    this.persist(record);
    for (const subscriber of this.subscribers) subscriber(event);
    return event;
  }

  setCandidate(taskId: string, candidate: UiCreationCandidate): void {
    const record = this.ensure(taskId);
    record.candidate = candidate;
    record.updatedAt = Date.now();
    record.workspaceId ??= candidate.workspaceId;
    record.targetPath ??= candidate.targetPath;
    this.persist(record);
  }

  updateCandidate(taskId: string, update: (candidate: UiCreationCandidate) => UiCreationCandidate): void {
    const record = this.ensure(taskId);
    if (!record.candidate) return;
    record.candidate = update(record.candidate);
    record.updatedAt = Date.now();
    this.persist(record);
  }

  completeCandidate(candidate: UiCreationCandidate): void {
    for (const record of this.tasks.values()) if (record.candidate?.id === candidate.id) {
      record.candidate = candidate;
      this.append(record.taskId, { lane: 'approval', type: 'artifact', status: 'completed', title: '草稿已保存', artifact: { kind: 'candidate', id: candidate.id, filePath: candidate.targetPath, candidate } });
      this.append(record.taskId, { lane: 'approval', type: 'done', status: 'completed', stage: 'saved', title: '本轮已完成，可以继续对话' });
    }
  }

  setPreview(taskId: string, preview: V3TaskPreview): void {
    const record = this.ensure(taskId);
    record.preview = preview;
    record.updatedAt = Date.now();
    this.persist(record);
  }

  snapshot(taskId: string): V3TaskSnapshot | undefined {
    const record = this.tasks.get(taskId) ?? this.restore(taskId);
    if (!record) return undefined;
    return {
      taskId: record.taskId, status: record.status, lastSequence: record.lastSequence,
      events: [...record.events], ...(record.candidate ? { candidate: record.candidate } : {}),
      ...(record.preview ? { preview: record.preview } : {}), createdAt: record.createdAt, updatedAt: record.updatedAt,
    };
  }

  list(workspaceId?: string): V3TaskHistoryItem[] {
    if (this.repository) return this.repository.listTaskSnapshots(workspaceId);
    return [...this.tasks.values()]
      .filter((record) => !workspaceId || record.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => ({ taskId: record.taskId, ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}), title: record.title, ...(record.targetPath ? { targetPath: record.targetPath } : {}), status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt }));
  }

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private ensure(taskId: string): TaskRecord {
    const current = this.tasks.get(taskId) ?? this.restore(taskId);
    if (current) return current;
    const now = Date.now();
    const created: TaskRecord = { taskId, status: 'pending', lastSequence: 0, events: [], createdAt: now, updatedAt: now, title: 'AI 任务' };
    this.tasks.set(taskId, created);
    return created;
  }

  private restore(taskId: string): TaskRecord | undefined {
    const snapshot = this.repository?.getTaskSnapshot(taskId);
    const metadata = this.repository?.getTaskHistoryItem(taskId);
    if (!snapshot || !metadata) return undefined;
    const record: TaskRecord = {
      taskId: snapshot.taskId, status: snapshot.status, lastSequence: snapshot.lastSequence,
      events: [...snapshot.events], ...(snapshot.candidate ? { candidate: snapshot.candidate } : {}),
      ...(snapshot.preview ? { preview: snapshot.preview } : {}), createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt,
      ...(metadata.workspaceId ? { workspaceId: metadata.workspaceId } : {}), title: metadata.title,
      ...(metadata.targetPath ? { targetPath: metadata.targetPath } : {}),
    };
    this.tasks.set(taskId, record);
    return record;
  }

  /**
   * Durable history is a convenience layered over the in-memory record the
   * renderer is already streaming. A repository that rejects a snapshot must
   * therefore never break the task: `persist` is called from the task's own
   * error handler, so a throw here escaped as an unhandled rejection and hid
   * the real failure.
   */
  private persist(record: TaskRecord): void {
    if (!this.repository) return;
    try {
      this.repository.saveTaskSnapshot({
        ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}), title: record.title,
        ...(record.targetPath ? { targetPath: record.targetPath } : {}), snapshot: this.toSnapshot(record),
      });
    } catch (error) {
      if (this.unpersistedTasks.has(record.taskId)) return;
      this.unpersistedTasks.add(record.taskId);
      console.error(`[task:${record.taskId}] 任务历史无法保存，任务本身会继续运行：`, error);
    }
  }

  private toSnapshot(record: TaskRecord): V3TaskSnapshot {
    return {
      taskId: record.taskId, status: record.status, lastSequence: record.lastSequence, events: [...record.events],
      ...(record.candidate ? { candidate: record.candidate } : {}), ...(record.preview ? { preview: record.preview } : {}),
      createdAt: record.createdAt, updatedAt: record.updatedAt,
    };
  }
}

function statusAfter(current: V3TaskSnapshot['status'], event: V3TaskEvent): V3TaskSnapshot['status'] {
  if (event.type === 'cancelled' || event.status === 'cancelled') return 'cancelled';
  if (event.type === 'error' || event.status === 'failed') return 'failed';
  if (event.type === 'done') return 'completed';
  if (event.status === 'warning') return 'warning';
  if (event.status === 'completed') return current === 'pending' ? 'completed' : current;
  return event.status === 'pending' ? 'pending' : 'running';
}
