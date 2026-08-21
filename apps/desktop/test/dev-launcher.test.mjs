import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DEV_HOST, DEV_PORT, RENDERER_NAME, createDevLauncherPlan, ensureElectronExecutable, resolveElectronExecutable } from '../scripts/dev-config.mjs';

const makeDesktopDirectory = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qt-ui-copilot-electron-'));
  const desktopDirectory = path.join(root, 'apps', 'desktop');
  const electronDirectory = path.join(root, 'node_modules', 'electron');
  await mkdir(desktopDirectory, { recursive: true });
  await mkdir(electronDirectory, { recursive: true });
  await writeFile(path.join(electronDirectory, 'package.json'), JSON.stringify({ version: '40.0.0' }));
  return { root, desktopDirectory, electronDirectory };
};

describe('development launcher plan', () => {
  it('starts a loopback-only renderer and defines the matching main-process globals', () => {
    const plan = createDevLauncherPlan('/workspace/apps/desktop');

    expect(plan.rendererServer.server).toEqual({ host: DEV_HOST, port: DEV_PORT, strictPort: true });
    expect(plan.rendererUrl).toBe('http://127.0.0.1:5173');
    expect(plan.mainBuild.define).toEqual({
      MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(plan.rendererUrl),
      MAIN_WINDOW_VITE_NAME: JSON.stringify(RENDERER_NAME),
    });
  });

  it('builds main and preload into the exact paths used by the Electron entry point', () => {
    const plan = createDevLauncherPlan('/workspace/apps/desktop');

    expect(plan.mainBuild.build).toMatchObject({
      outDir: path.join('/workspace/apps/desktop', '.vite', 'build'),
      emptyOutDir: true,
      lib: { fileName: 'main' },
    });
    expect(plan.preloadBuild.build).toMatchObject({
      outDir: path.join('/workspace/apps/desktop', '.vite', 'build'),
      emptyOutDir: false,
      lib: { fileName: 'index' },
    });
  });

  it('uses an explicit Electron path when one is supplied', () => {
    expect(resolveElectronExecutable('/workspace/apps/desktop', process.execPath)).toBe(process.execPath);
  });

  it('uses the existing runtime without downloading it', async () => {
    const fixture = await makeDesktopDirectory();
    try {
      const executable = path.join(fixture.electronDirectory, 'dist', 'electron.exe');
      await mkdir(path.dirname(executable), { recursive: true });
      await writeFile(executable, 'existing runtime');
      const downloadArtifact = async () => { throw new Error('must not download'); };

      await expect(ensureElectronExecutable(fixture.desktopDirectory, {
        platform: 'win32', downloadArtifact,
      })).resolves.toBe(executable);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('downloads, extracts and verifies a missing runtime while respecting ELECTRON_MIRROR', async () => {
    const fixture = await makeDesktopDirectory();
    try {
      let request;
      const executable = await ensureElectronExecutable(fixture.desktopDirectory, {
        platform: 'win32',
        arch: 'x64',
        environment: { ELECTRON_MIRROR: 'https://mirror.example/electron/' },
        downloadArtifact: async (receivedRequest) => {
          request = receivedRequest;
          return 'cached-electron.zip';
        },
        extractZip: async (_archive, { dir }) => {
          await writeFile(path.join(dir, 'electron.exe'), 'downloaded runtime');
        },
      });

      expect(executable).toBe(path.join(fixture.electronDirectory, 'dist', 'electron.exe'));
      expect(request).toEqual({
        version: '40.0.0', artifactName: 'electron', platform: 'win32', arch: 'x64',
        mirrorOptions: { mirror: 'https://mirror.example/electron/' },
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails safely when Electron cannot be downloaded', async () => {
    const fixture = await makeDesktopDirectory();
    try {
      await expect(ensureElectronExecutable(fixture.desktopDirectory, {
        platform: 'win32',
        downloadArtifact: async () => { throw new Error('network unavailable'); },
      })).rejects.toThrow('Unable to restore Electron runtime (40.0.0). Check network access or ELECTRON_MIRROR.');
      expect(resolveElectronExecutable.bind(undefined, fixture.desktopDirectory, undefined, 'win32')).toThrow('Electron executable is missing');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
