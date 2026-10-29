import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeAssets } from './runtime-assets.js';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('runtime asset verification', () => {
  it('ships the complete GTRONICK/QSS source inputs before packaging', async () => {
    const root = resolve(__dirname, '../../../../resources/external-component-libraries/gtronick-qss');
    expect(await readFile(join(root, 'LICENSE'), 'utf8')).toContain('MIT License');
    expect(await readFile(join(root, 'styles', 'MaterialDark.qss'), 'utf8')).toContain('QPushButton');
    const componentsRoot = join(root, 'components');
    const componentDirectories = await readdir(componentsRoot, { withFileTypes: true });
    const manifests = await Promise.all(componentDirectories.filter((entry) => entry.isDirectory()).map((entry) => readFile(join(componentsRoot, entry.name, 'component.json'), 'utf8')));
    expect(manifests).toHaveLength(7);
    expect(manifests.every((manifest) => manifest.includes('MaterialDark.qss'))).toBe(true);
  });

  it('rejects a packaged asset whose bytes no longer match the manifest', async () => {
    const root = join(tmpdir(), `qt-ui-copilot-assets-${randomUUID()}`);
    await mkdir(join(root, 'probe'), { recursive: true });
    await writeFile(join(root, 'probe', 'QtUiProbe.h'), 'trusted', 'utf8');
    await writeFile(join(root, 'assets-manifest.json'), JSON.stringify({ version: 1, assets: [{ path: 'probe/QtUiProbe.h', sha256: hash('trusted') }] }), 'utf8');
    await expect(verifyRuntimeAssets(root)).resolves.toBeUndefined();
    await writeFile(join(root, 'probe', 'QtUiProbe.h'), 'tampered', 'utf8');
    await expect(verifyRuntimeAssets(root)).rejects.toThrow('checksum mismatch');
  });
});
