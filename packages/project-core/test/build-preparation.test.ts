import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import { inferBuildDirectory, prepareBuild } from '../src/build-preparation.js';

const profile = (rootDir: string): ProjectProfile => ({
  id: 'build-test', rootDir,
  qt: { version: '6.10.2', uic: 'uic', rcc: 'rcc' },
  build: {
    command: { executable: 'cmake', args: ['--build', path.join(rootDir, '.qt-ui-copilot', 'build'), '--config', 'Debug'] },
    configure: { executable: 'cmake', args: ['-S', rootDir, '-B', path.join(rootDir, '.qt-ui-copilot', 'build')] },
  },
  run: { executable: 'app', args: [], environment: {} },
});

describe('build preparation', () => {
  it('infers an argv build directory without invoking a shell', () => {
    const root = path.resolve(tmpdir(), 'projects', 'demo');
    expect(inferBuildDirectory(['--build', path.join(root, '.qt-ui-copilot', 'build')], root))
      .toBe(path.normalize(path.join(root, '.qt-ui-copilot', 'build')));
    const build = path.resolve(tmpdir(), 'build');
    expect(inferBuildDirectory([`--build=${build}`], root)).toBe(build);
  });

  it('runs configure once when the build directory is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-build-'));
    try {
      const calls: unknown[] = [];
      const result = await prepareBuild(profile(root), async (command) => {
        calls.push(command);
        return { executable: command.executable, args: [...command.args], stdout: 'configured', stderr: '', exitCode: 0, timedOut: false };
      });
      expect(result.configured).toBe(true);
      expect(calls).toHaveLength(1);
      expect((calls[0] as { args: string[] }).args).toContain('-S');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('does not reconfigure an existing build directory', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-build-'));
    try {
      mkdirSync(path.join(root, '.qt-ui-copilot', 'build'), { recursive: true });
      let called = false;
      const result = await prepareBuild(profile(root), async () => {
        called = true;
        throw new Error('configure should not run');
      });
      expect(result.configured).toBe(false);
      expect(called).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
