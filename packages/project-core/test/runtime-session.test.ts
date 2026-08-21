import { EventEmitter } from 'node:events';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuntimeSession, type SpawnedRuntimeProcess } from '../src/index.js';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';

class FakeChild extends EventEmitter implements SpawnedRuntimeProcess {
  pid = 123;
  killed = false;
  kill(): boolean { this.killed = true; this.emit('exit', 0, null); return true; }
}

const profile: ProjectProfile = {
  id: 'fixture', rootDir: mkdtempSync(join(tmpdir(), 'qt-ui-copilot-profile-')),
  qt: { version: '5.9.6', uic: 'uic', rcc: 'rcc' }, build: { command: { executable: 'cmake', args: [] } },
  run: { executable: 'fixture.exe', args: ['--test'], environment: { FIXTURE: 'yes' } },
};

describe('RuntimeSession', () => {
  it('creates an isolated config profile and injects the probe token without a shell', async () => {
    const child = new FakeChild();
    let launch: { executable: string; options: { shell?: boolean; env?: NodeJS.ProcessEnv } } | undefined;
    const session = new RuntimeSession(profile, 'task-1', {
      spawn: (executable, _args, options) => { launch = { executable, options }; queueMicrotask(() => child.emit('spawn')); return child; },
      waitForProbe: async () => undefined,
    });
    await session.launch();
    expect(existsSync(session.configDirectory)).toBe(true);
    expect(launch).toMatchObject({ executable: 'fixture.exe', options: { shell: false, env: expect.objectContaining({ QT_UI_COPILOT_TOKEN: session.token, APP_CONFIG_DIR: session.configDirectory, FIXTURE: 'yes' }) } });
    await session.stop();
    expect(child.killed).toBe(true);
  });

  it('refuses to launch without an explicit Probe readiness check', async () => {
    const child = new FakeChild();
    const session = new RuntimeSession(profile, 'task-2', {
      spawn: () => { queueMicrotask(() => child.emit('spawn')); return child; },
      stopTimeoutMs: 1,
    });
    await expect(session.launch()).rejects.toThrow('requires a Probe readiness check');
  });
});
