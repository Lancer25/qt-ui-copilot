import type { UiCreationCandidate, V3TaskEvent, V3TaskPreview, V3TaskSnapshot } from '@qt-ui-copilot/contracts';

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
}

/**
 * Main-process source of truth for resumable V3 task activity. Renderer code
 * only observes events and snapshots emitted from this service.
 */
export class V3TaskEventService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly subscribers = new Set<Subscriber>();

  append(taskId: string, draft: V3TaskEventDraft): V3TaskEvent {
    const record = this.ensure(taskId);
    const event: V3TaskEvent = { ...draft, taskId, sequence: record.lastSequence + 1, timestamp: Date.now() };
    record.lastSequence = event.sequence;
    record.events.push(event);
    if (record.events.length > MAX_EVENTS) record.events.splice(0, record.events.length - MAX_EVENTS);
    record.status = statusAfter(record.status, event);
    record.updatedAt = event.timestamp;
    for (const subscriber of this.subscribers) subscriber(event);
    return event;
  }

  setCandidate(taskId: string, candidate: UiCreationCandidate): void {
    const record = this.ensure(taskId);
    record.candidate = candidate;
    record.updatedAt = Date.now();
  }

  updateCandidate(taskId: string, update: (candidate: UiCreationCandidate) => UiCreationCandidate): void {
    const record = this.ensure(taskId);
    if (!record.candidate) return;
    record.candidate = update(record.candidate);
    record.updatedAt = Date.now();
  }

  setPreview(taskId: string, preview: V3TaskPreview): void {
    const record = this.ensure(taskId);
    record.preview = preview;
    record.updatedAt = Date.now();
  }

  snapshot(taskId: string): V3TaskSnapshot | undefined {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;
    return {
      taskId: record.taskId, status: record.status, lastSequence: record.lastSequence,
      events: [...record.events], ...(record.candidate ? { candidate: record.candidate } : {}),
      ...(record.preview ? { preview: record.preview } : {}), createdAt: record.createdAt, updatedAt: record.updatedAt,
    };
  }

  subscribe(listener: Subscriber): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private ensure(taskId: string): TaskRecord {
    const current = this.tasks.get(taskId);
    if (current) return current;
    const now = Date.now();
    const created: TaskRecord = { taskId, status: 'pending', lastSequence: 0, events: [], createdAt: now, updatedAt: now };
    this.tasks.set(taskId, created);
    return created;
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
