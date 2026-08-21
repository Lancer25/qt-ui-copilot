import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewHostCacheKey, type QtKit } from '../src/preview-host-builder.js';
import { PreviewClient, PreviewHostError } from '../src/preview-client.js';

const kit: QtKit = {
  qtVersion: '5.9.6', compilerAbi: 'msvc2017_64', architecture: 'x64', buildType: 'Release', operatingSystem: 'win32',
  cmakeExecutable: 'cmake', cmakePrefixPath: 'C:/Qt/5.9.6/msvc2017_64', sourceDirectory: 'native/qt-ui-preview-host', cacheDirectory: 'tmp',
};

describe('PreviewHost per-Kit cache key', () => {
  it.each([
    ['qtVersion', '6.8.0'], ['compilerAbi', 'clang_64'], ['architecture', 'arm64'], ['buildType', 'Debug'], ['operatingSystem', 'linux'],
  ] as const)('changes when %s differs', (key, value) => {
    expect(previewHostCacheKey({ ...kit, [key]: value })).not.toBe(previewHostCacheKey(kit));
  });
});

const fakeHost = path.join(import.meta.dirname, 'fake-host.mjs');
const request = { uiFile: 'test.ui', width: 300, height: 200, rccExecutable: 'rcc' };
// Process startup on a busy CI worker can exceed 100ms. Keep timeout behavior
// covered by the dedicated 20ms case instead of making a valid JSON response
// race against Node process creation.
function fakeClient(mode: string, timeout = 1_000): PreviewClient {
  return new PreviewClient({ executable: process.execPath, args: [fakeHost] }, timeout);
}

describe('PreviewClient protocol failures', () => {
  it('converts native custom-widget evidence into the public result', async () => {
    process.env.PREVIEW_FAKE_MODE = 'degraded';
    await expect(fakeClient('degraded').render(request)).resolves.toMatchObject({
      success: true,
      degradedFeatures: [expect.stringContaining('Chart previewed as QWidget')],
    });
    delete process.env.PREVIEW_FAKE_MODE;
  });
  it('rejects malformed JSON-lines responses', async () => {
    process.env.PREVIEW_FAKE_MODE = 'malformed';
    await expect(fakeClient('malformed').render(request)).rejects.toMatchObject<Partial<PreviewHostError>>({ code: 'MALFORMED_RESPONSE' });
    delete process.env.PREVIEW_FAKE_MODE;
  });
  it('rejects a crashing host', async () => {
    process.env.PREVIEW_FAKE_MODE = 'crash';
    await expect(fakeClient('crash').render(request)).rejects.toMatchObject<Partial<PreviewHostError>>({ code: 'CRASHED' });
    delete process.env.PREVIEW_FAKE_MODE;
  });
  it('times out a host without a JSON line', async () => {
    process.env.PREVIEW_FAKE_MODE = 'timeout';
    await expect(fakeClient('timeout', 20).render(request)).rejects.toMatchObject<Partial<PreviewHostError>>({ code: 'TIMEOUT' });
    delete process.env.PREVIEW_FAKE_MODE;
  });

  it('prepends the exact target Qt bin directory and forwards target-kit variables', async () => {
    const qtBinDirectory = process.platform === 'win32' ? 'C:\\Qt\\6.10.2\\msvc2022_64\\bin' : '/opt/qt/6.10.2/bin';
    const client = new PreviewClient({
      executable: process.execPath,
      args: [fakeHost],
      qtBinDirectory,
      environment: {
        PREVIEW_FAKE_MODE: 'environment',
        PREVIEW_TEST_QT_BIN: qtBinDirectory,
        PREVIEW_TEST_MARKER: 'configured',
      },
    });
    await expect(client.render(request)).resolves.toMatchObject({ success: true });
  });
});
