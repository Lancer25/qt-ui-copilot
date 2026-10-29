import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(import.meta.dirname, '..');

describe('production main-process bundle', () => {
  it('bundles zod instead of leaving a repository-dependent runtime require', async () => {
    await execFileAsync(process.execPath, ['scripts/build-production-assets.mjs'], {
      cwd: desktopRoot,
      windowsHide: true,
    });

    const mainBundle = await readFile(path.join(desktopRoot, '.vite/build/main.js'), 'utf8');

    expect(mainBundle).not.toMatch(/require\(["']zod["']\)/);
  }, 60_000);
});
