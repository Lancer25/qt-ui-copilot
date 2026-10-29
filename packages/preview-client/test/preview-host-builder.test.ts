import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { previewHostCacheKey, previewHostSourceFingerprint, type QtKit } from '../src/preview-host-builder.js';

const roots: string[] = [];
const kit = (sourceDirectory: string): QtKit => ({
  qtVersion: '5.9.6', compilerAbi: 'msvc2015_64', architecture: 'x86_64', buildType: 'Debug',
  operatingSystem: 'win32', cmakeExecutable: 'cmake', cmakePrefixPath: 'D:/Qt/5.9.6',
  sourceDirectory, cacheDirectory: 'D:/cache',
});

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('PreviewHost source-aware cache key', () => {
  it('stays stable for identical sources and changes when host source changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'preview-host-source-')); roots.push(root);
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'CMakeLists.txt'), 'add_executable(qt-ui-preview-host src/main.cpp)');
    await writeFile(join(root, 'src', 'main.cpp'), 'int main() { return 0; }');

    const firstFingerprint = await previewHostSourceFingerprint(root);
    const firstKey = previewHostCacheKey(kit(root), firstFingerprint);
    expect(previewHostCacheKey(kit(root), await previewHostSourceFingerprint(root))).toBe(firstKey);
    expect(previewHostCacheKey({ ...kit(root), cmakeGenerator: 'NMake Makefiles' }, firstFingerprint)).not.toBe(firstKey);

    await writeFile(join(root, 'src', 'main.cpp'), 'int main() { return 1; }');
    const changedFingerprint = await previewHostSourceFingerprint(root);
    expect(changedFingerprint).not.toBe(firstFingerprint);
    expect(previewHostCacheKey(kit(root), changedFingerprint)).not.toBe(firstKey);
  });

  it('separates byte-identical host sources installed at different paths', async () => {
    const first = await mkdtemp(join(tmpdir(), 'preview-host-install-a-')); roots.push(first);
    const second = await mkdtemp(join(tmpdir(), 'preview-host-install-b-')); roots.push(second);
    for (const root of [first, second]) {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'CMakeLists.txt'), 'add_executable(qt-ui-preview-host src/main.cpp)');
      await writeFile(join(root, 'src', 'main.cpp'), 'int main() { return 0; }');
    }

    const fingerprint = await previewHostSourceFingerprint(first);
    expect(await previewHostSourceFingerprint(second)).toBe(fingerprint);
    expect(previewHostCacheKey(kit(second), fingerprint)).not.toBe(previewHostCacheKey(kit(first), fingerprint));
  });
});
