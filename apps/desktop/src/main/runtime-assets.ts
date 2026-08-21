import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface RuntimeAssetEntry {
  path: string;
  sha256: string;
}

export interface RuntimeAssetManifest {
  version: 1;
  assets: RuntimeAssetEntry[];
}

const sha256 = (contents: Buffer): string => createHash('sha256').update(contents).digest('hex');

/**
 * Verifies the assets Electron loads outside ASAR.  Native Qt sources are
 * intentionally shipped as source because PreviewHost and Probe must be built
 * with the target application's Qt kit, not with an Electron-bundled ABI.
 */
export async function verifyRuntimeAssets(assetRoot: string): Promise<void> {
  const manifestPath = join(assetRoot, 'assets-manifest.json');
  await access(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RuntimeAssetManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) throw new Error('Invalid runtime asset manifest');

  for (const entry of manifest.assets) {
    if (!entry.path || entry.path.includes('..') || !/^[a-f0-9]{64}$/i.test(entry.sha256)) {
      throw new Error('Invalid runtime asset manifest entry');
    }
    const actual = sha256(await readFile(join(assetRoot, entry.path)));
    if (actual !== entry.sha256) throw new Error(`Runtime asset checksum mismatch: ${entry.path}`);
  }
}
