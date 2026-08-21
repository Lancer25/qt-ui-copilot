import { randomUUID } from 'node:crypto';

export type WorkerCommand =
  | { type: 'start'; taskId: string; instruction: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' };
export type WorkerEvent =
  | { type: 'action'; taskId: string; detail: string }
  | { type: 'finished'; taskId: string }
  | { type: 'failed'; taskId?: string; error: string };

export interface GuidedNavigation {
  run(instruction: string, signal: AbortSignal, onAction: (detail: string) => void): Promise<void>;
  pause?(): void;
  resume?(): void;
  stop?(): void;
}

/** Stateful message controller used inside Electron's isolated utility process. */
export class UiTarsWorkerController {
  private current?: { taskId: string; controller: AbortController; paused: boolean; instruction: string };
  constructor(private readonly navigation: GuidedNavigation, private readonly emit: (event: WorkerEvent) => void) {}

  handle(command: WorkerCommand): void {
    if (command.type === 'start') {
      if (this.current) { this.emit({ type: 'failed', taskId: command.taskId, error: 'A UI-TARS task is already running' }); return; }
      const controller = new AbortController();
      this.current = { taskId: command.taskId, controller, paused: false, instruction: command.instruction };
      void this.run(this.current);
      return;
    }
    if (!this.current) return;
    if (command.type === 'stop') { this.current.controller.abort(); this.navigation.stop?.(); return; }
    if (command.type === 'pause') { this.current.paused = true; this.navigation.pause?.(); }
    if (command.type === 'resume') { this.current.paused = false; this.navigation.resume?.(); }
  }

  private async run(task: NonNullable<UiTarsWorkerController['current']>): Promise<void> {
    try {
      await this.navigation.run(task.instruction, task.controller.signal, (detail) => {
        if (!task.paused && !task.controller.signal.aborted) this.emit({ type: 'action', taskId: task.taskId, detail });
      });
      if (task.controller.signal.aborted) this.emit({ type: 'failed', taskId: task.taskId, error: 'UI-TARS task stopped' });
      else this.emit({ type: 'finished', taskId: task.taskId });
    } catch (error) { this.emit({ type: 'failed', taskId: task.taskId, error: error instanceof Error ? error.message : String(error) }); }
    finally { if (this.current === task) this.current = undefined; }
  }
}

/** Production worker entry. Model configuration is supplied only by a later Main-process integration. */
export function installUtilityProcessWorker(navigation: GuidedNavigation): UiTarsWorkerController {
  // Electron augments Node's Process with parentPort for utility processes;
  // keep the package itself compilable under plain Node/Vitest declarations.
  const port = (process as NodeJS.Process & { parentPort?: { postMessage(message: unknown): void; on(event: 'message', listener: (message: WorkerCommand) => void): void } }).parentPort;
  if (!port) throw new Error('UI-TARS worker must run in an Electron utility process');
  const controller = new UiTarsWorkerController(navigation, (event) => port.postMessage({ ...event, eventId: randomUUID() }));
  port.on('message', (command: WorkerCommand) => controller.handle(command));
  return controller;
}
