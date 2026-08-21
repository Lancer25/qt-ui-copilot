import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';

export interface SpawnedRuntimeProcess extends Pick<ChildProcess, 'pid' | 'kill' | 'once'> {}

export interface RuntimeSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  windowsHide: true;
  stdio: 'ignore';
}

export interface RuntimeSessionDependencies {
  spawn?: (executable: string, args: readonly string[], options: RuntimeSpawnOptions) => SpawnedRuntimeProcess;
  waitForProbe?: (session: RuntimeSession) => Promise<void>;
  gracefulStop?: (session: RuntimeSession) => Promise<void>;
  stopTimeoutMs?: number;
}

function safeTaskSegment(taskId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(taskId)) throw new Error('Task id contains unsafe path characters');
  return taskId;
}

function waitForExit(child: SpawnedRuntimeProcess, timeoutMs: number): Promise<boolean> {
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolveExit(true); });
  });
}

/** Owns one test-only application instance and its isolated per-task configuration directory. */
export class RuntimeSession {
  readonly token = randomBytes(24).toString('hex');
  readonly serverName = `qt-ui-copilot-${this.token}`;
  readonly configDirectory: string;
  private child?: SpawnedRuntimeProcess;
  private didExit = false;

  constructor(readonly profile: ProjectProfile, taskId: string, private readonly dependencies: RuntimeSessionDependencies = {}) {
    const sessionsRoot = resolve(profile.rootDir, '.qt-ui-copilot', 'sessions');
    this.configDirectory = resolve(sessionsRoot, safeTaskSegment(taskId), this.token);
    if (!this.configDirectory.startsWith(`${sessionsRoot}${sep}`)) throw new Error('Runtime session path escapes project root');
  }

  async launch(): Promise<void> {
    if (this.child) throw new Error('Runtime session is already running');
    this.didExit = false;
    mkdirSync(this.configDirectory, { recursive: true });
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.profile.run.environment,
      QT_UI_COPILOT: '1',
      QT_UI_COPILOT_TOKEN: this.token,
      QT_UI_COPILOT_SERVER_NAME: this.serverName,
      QT_UI_COPILOT_ENABLE_ACTIONS: '1',
      APP_CONFIG_DIR: this.configDirectory,
    };
    const spawn = this.dependencies.spawn ?? ((executable, args, options) => nodeSpawn(executable, [...args], options));
    const child = spawn(this.profile.run.executable, this.profile.run.args, {
      cwd: this.profile.rootDir, env: environment, shell: false, windowsHide: true, stdio: 'ignore',
    });
    this.child = child;
    child.once('exit', () => { this.didExit = true; });
    try {
      await new Promise<void>((resolveSpawn, rejectSpawn) => {
        child.once('spawn', resolveSpawn);
        child.once('error', rejectSpawn);
        child.once('exit', (code) => rejectSpawn(new Error(`Application exited before Probe became available (code ${String(code)})`)));
      });
      if (!this.dependencies.waitForProbe) throw new Error('RuntimeSession requires a Probe readiness check');
      await this.dependencies.waitForProbe(this);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child || this.didExit) return;
    const timeoutMs = this.dependencies.stopTimeoutMs ?? 3_000;
    if (this.dependencies.gracefulStop) {
      const gracefulExit = waitForExit(child, timeoutMs);
      try { await this.dependencies.gracefulStop(this); } catch { /* fall through to termination */ }
      if (await gracefulExit) return;
    }
    const terminated = waitForExit(child, timeoutMs);
    child.kill('SIGTERM');
    if (!(await terminated)) child.kill('SIGKILL');
  }
}
