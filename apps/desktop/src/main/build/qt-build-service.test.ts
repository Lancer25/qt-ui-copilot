import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { QtBuildService } from './qt-build-service.js';

const qt = { version: '6.8.0', binDirectory: 'C:/Qt/bin', uic: 'uic', rcc: 'rcc' };
const ok = (executable: string, args: readonly string[]) => ({ executable, args: [...args], stdout: '', stderr: '', exitCode: 0, timedOut: false });

describe('QtBuildService', () => {
  it('plans and runs an explicit qmake build', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-build-')); const staged = path.join(root, 'candidate'); await mkdir(staged); await writeFile(path.join(staged, 'demo.pro'), 'QT += widgets');
    const commands: string[] = []; const runner = vi.fn(async (command) => { commands.push(command.executable); if (command.executable.includes('jom')) await writeFile(path.join(root, 'build', 'demo.exe'), ''); return ok(command.executable, command.args); });
    const result = await new QtBuildService(runner).build({ projectRoot: root, stagedRoot: staged, backend: 'qmake', qt: { ...qt, qmake: 'qmake', make: 'jom' } as never, buildDirectory: 'build' });
    expect(result.backend).toBe('qmake'); expect(commands).toEqual(['qmake', 'jom']);
  });

  it('detects msbuild automatically and rejects ambiguous projects', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-build-')); const staged = path.join(root, 'candidate'); await mkdir(staged); await writeFile(path.join(staged, 'demo.sln'), '');
    await expect(new QtBuildService().detectBackend({ projectRoot: root, stagedRoot: staged, backend: 'auto' })).resolves.toBe('msbuild');
    await writeFile(path.join(staged, 'demo.pro'), '');
    await expect(new QtBuildService().detectBackend({ projectRoot: root, stagedRoot: staged, backend: 'auto' })).rejects.toThrow(/ambiguous/i);
  });

  it('honors an already-aborted signal before spawning', async () => {
    const controller = new AbortController(); controller.abort(); const runner = vi.fn();
    await expect(new QtBuildService(runner).build({ projectRoot: 'C:/project', stagedRoot: 'C:/candidate', backend: 'auto', qt: qt, buildDirectory: 'build', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(runner).not.toHaveBeenCalled();
  });
});
