import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRuntimeAssets } from './runtime-assets.js';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('runtime asset verification', () => {
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
