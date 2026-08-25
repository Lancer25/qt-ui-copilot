import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RevisionService } from './revision-service';

describe('RevisionService', () => {
  it('keeps source unchanged when validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v3-revision-')); const file = join(root, 'Settings.ui'); await writeFile(file, '<ui/>');
    const service = new RevisionService({ apply: (source) => `${source}candidate`, validate: async () => ({ xml: true, semantic: true, uic: false, preview: false, findings: [{ severity: 'error', code: 'uic', message: 'failed' }], validatedAt: Date.now() }) });
    await expect(service.apply(file, [], 'conversation')).rejects.toThrow('source file was not changed'); expect(await readFile(file, 'utf8')).toBe('<ui/>');
  });
  it('commits a fully validated candidate with hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v3-revision-')); const file = join(root, 'Settings.ui'); await writeFile(file, '<ui/>');
    const service = new RevisionService({ apply: (source) => `${source}candidate`, validate: async () => ({ xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: Date.now() }) });
    const result = await service.apply(file, [], 'conversation'); expect(result.beforeHash).not.toBe(result.afterHash); expect(await readFile(file, 'utf8')).toContain('candidate');
  });
  it('undoes and redoes the last committed revision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v3-revision-')); const file = join(root, 'Settings.ui'); await writeFile(file, '<ui/>');
    const service = new RevisionService({ apply: (source) => `${source}candidate`, validate: async () => ({ xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: Date.now() }) });
    await service.apply(file, [], 'conversation'); await service.undo(file); expect(await readFile(file, 'utf8')).toBe('<ui/>'); await service.redo(file); expect(await readFile(file, 'utf8')).toContain('candidate');
  });
  it('refuses to overwrite an external edit until the caller rebases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v3-revision-')); const file = join(root, 'Settings.ui'); await writeFile(file, '<ui/>');
    const service = new RevisionService({ apply: (source) => `${source}candidate`, validate: async () => ({ xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: Date.now() }) });
    await service.apply(file, [], 'conversation'); await writeFile(file, '<ui/>external');
    await expect(service.undo(file)).rejects.toThrow('External change'); await service.rebaseAfterExternalChange(file); await service.undo(file); expect(await readFile(file, 'utf8')).toBe('<ui/>external');
  });
});
