import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import { parseQtMajorMinor, probeQtToolchain, validateUiWithUic, type ProcessCommand } from '../src/index.js';

const profile: ProjectProfile = {
  id: 'demo', rootDir: path.resolve(tmpdir(), 'demo'),
  qt: { version: '5.9.6', uic: 'D:/Qt/bin/uic.exe', rcc: 'D:/Qt/bin/rcc.exe' },
  build: { command: { executable: 'cmake', args: ['--build', 'build'] } },
  run: { executable: 'D:/demo/build/demo.exe', args: [], environment: {} },
};

describe('toolchain helpers', () => {
  it('extracts Qt major/minor versions from legacy tool output', () => {
    expect(parseQtMajorMinor('uic 5.9.6')).toEqual({ major: 5, minor: 9 });
    expect(parseQtMajorMinor('Qt Resource Compiler version 6.8.1')).toEqual({ major: 6, minor: 8 });
  });

  it('rejects validation targets outside the configured project root before spawning', async () => {
    await expect(validateUiWithUic(profile, path.resolve(tmpdir(), 'other', 'Settings.ui'))).rejects.toThrow('escapes project root');
  });

  it('passes a target-kit uic an argv array and never accepts a shell string', async () => {
    const captured: ProcessCommand[] = [];
    const uiFile = path.join(profile.rootDir, 'Settings.ui');
    await validateUiWithUic(profile, uiFile, async (command) => {
      captured.push(command);
      return { executable: command.executable, args: [...command.args], stdout: '', stderr: '', exitCode: 0, timedOut: false };
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ executable: profile.qt.uic, args: expect.arrayContaining(['-o', uiFile]) });
    expect(captured[0]).not.toHaveProperty('shell');
  });

  it('marks a mixed major/minor kit as incompatible', async () => {
    const report = await probeQtToolchain(profile, async (command) => ({
      executable: command.executable, args: [...command.args], stdout: command.executable === profile.qt.uic ? 'uic 5.9.6' : 'rcc 6.8.1',
      stderr: '', exitCode: 0, timedOut: false,
    }));
    expect(report.compatible).toBe(false);
  });
});
