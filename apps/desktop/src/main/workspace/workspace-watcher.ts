import { EventEmitter } from 'node:events';
import { WorkspaceService, type WorkspaceFile, type WorkspaceScanOptions } from './workspace-service';

export type WorkspaceChange =
  | { type: 'created'; workspaceId: string; path: string; file: WorkspaceFile }
  | { type: 'changed'; workspaceId: string; path: string; file: WorkspaceFile; previousHash: string }
  | { type: 'deleted'; workspaceId: string; path: string; previousHash: string }
  | { type: 'renamed'; workspaceId: string; path: string; oldPath: string; file: WorkspaceFile; previousHash: string };

type WatchEvents = { change: [WorkspaceChange]; error: [Error] };

/**
 * A deliberately conservative watcher.  Polling a bounded, already-filtered
 * workspace snapshot avoids platform differences in recursive fs.watch (most
 * notably Linux) and also gives us stable content hashes for conflict checks.
 */
export class WorkspaceWatcher extends EventEmitter<WatchEvents> {
  private timer?: ReturnType<typeof setInterval>;
  private snapshot = new Map<string, WorkspaceFile>();
  private expectedWrites = new Map<string, string>();
  private checking = false;

  constructor(
    private readonly service: WorkspaceService,
    private readonly workspaceId: string,
    private readonly options: { intervalMs?: number } = {},
  ) { super(); }

  async start(): Promise<void> {
    this.snapshot = new Map((await this.service.listFiles(this.workspaceId)).map((file) => [file.absolutePath, file]));
    const interval = Math.max(100, this.options.intervalMs ?? 150);
    this.timer = setInterval(() => { void this.refresh(); }, interval);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Suppress the next matching hash transition caused by an app-owned write. */
  expectAppWrite(path: string, hash: string): void { this.expectedWrites.set(path, hash); }

  async refresh(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const current = new Map((await this.service.listFiles(this.workspaceId)).map((file) => [file.absolutePath, file]));
      const deleted = [...this.snapshot.entries()].filter(([path]) => !current.has(path));
      const created = [...current.entries()].filter(([path]) => !this.snapshot.has(path));
      const consumedDeleted = new Set<string>();
      const consumedCreated = new Set<string>();

      // A rename has one deleted and one created path with an identical hash.
      for (const [oldPath, previous] of deleted) {
        const match = created.find(([newPath, file]) => !consumedCreated.has(newPath) && file.contentHash === previous.contentHash);
        if (!match) continue;
        consumedDeleted.add(oldPath); consumedCreated.add(match[0]);
        this.emit('change', { type: 'renamed', workspaceId: this.workspaceId, oldPath, path: match[0], file: match[1], previousHash: previous.contentHash });
      }
      for (const [path, previous] of deleted) {
        if (consumedDeleted.has(path)) continue;
        this.emit('change', { type: 'deleted', workspaceId: this.workspaceId, path, previousHash: previous.contentHash });
      }
      for (const [path, file] of created) {
        if (consumedCreated.has(path)) continue;
        this.emit('change', { type: 'created', workspaceId: this.workspaceId, path, file });
      }
      for (const [path, file] of current) {
        const previous = this.snapshot.get(path);
        if (!previous || previous.contentHash === file.contentHash) continue;
        const expected = this.expectedWrites.get(path);
        if (expected && expected === file.contentHash) { this.expectedWrites.delete(path); continue; }
        this.emit('change', { type: 'changed', workspaceId: this.workspaceId, path, file, previousHash: previous.contentHash });
      }
      this.snapshot = current;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    } finally { this.checking = false; }
  }
}
