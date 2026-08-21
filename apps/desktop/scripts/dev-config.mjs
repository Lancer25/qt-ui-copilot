import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const DEV_HOST = '127.0.0.1';
export const DEV_PORT = 5173;
export const RENDERER_NAME = 'main_window';

export const createDevLauncherPlan = (desktopDirectory) => {
  const buildDirectory = path.join(desktopDirectory, '.vite', 'build');
  const rendererUrl = `http://${DEV_HOST}:${DEV_PORT}`;

  return {
    buildDirectory,
    rendererUrl,
    rendererServer: {
      configFile: path.join(desktopDirectory, 'vite.renderer.config.ts'),
      server: { host: DEV_HOST, port: DEV_PORT, strictPort: true },
    },
    mainBuild: {
      configFile: path.join(desktopDirectory, 'vite.main.config.ts'),
      define: {
        MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(rendererUrl),
        MAIN_WINDOW_VITE_NAME: JSON.stringify(RENDERER_NAME),
      },
      build: {
        lib: {
          entry: path.join(desktopDirectory, 'src', 'main', 'main.ts'),
          formats: ['cjs'],
          fileName: 'main',
        },
        outDir: buildDirectory,
        emptyOutDir: true,
      },
    },
    preloadBuild: {
      configFile: path.join(desktopDirectory, 'vite.preload.config.ts'),
      build: {
        lib: {
          entry: path.join(desktopDirectory, 'src', 'preload', 'index.ts'),
          formats: ['cjs'],
          fileName: 'index',
        },
        outDir: buildDirectory,
        emptyOutDir: false,
      },
    },
  };
};

const electronExecutableRelativePath = (platform) => {
  if (platform === 'win32') return 'electron.exe';
  if (platform === 'darwin') return path.join('Electron.app', 'Contents', 'MacOS', 'Electron');
  return 'electron';
};

const electronPackageDirectoryFor = (desktopDirectory) => path.resolve(
  desktopDirectory,
  '..',
  '..',
  'node_modules',
  'electron',
);

export const resolveElectronExecutable = (desktopDirectory, overridePath, platform = process.platform) => {
  const executable = overridePath ?? path.join(
    electronPackageDirectoryFor(desktopDirectory),
    'dist',
    electronExecutableRelativePath(platform),
  );

  if (!existsSync(executable)) {
    throw new Error(`Electron executable is missing: ${executable}`);
  }

  return executable;
};

const defaultDownloadArtifact = async (request) => {
  const { downloadArtifact } = await import('@electron/get');
  return downloadArtifact(request);
};

const defaultExtractZip = async (archive, options) => {
  const module = await import('extract-zip');
  const extractZip = module.default ?? module;
  return extractZip(archive, options);
};

/**
 * Restores Electron after a package-manager rebuild removes electron/dist.
 *
 * The Electron package's path.txt is deliberately not consulted: this launcher
 * owns a fixed, platform-specific executable path and verifies it after every
 * recovery. Downloads retain @electron/get checksum verification and honour
 * ELECTRON_MIRROR when it is configured by the developer.
 */
export const ensureElectronExecutable = async (desktopDirectory, options = {}) => {
  const {
    overridePath,
    platform = process.platform,
    arch = process.arch,
    environment = process.env,
    electronVersion,
    downloadArtifact = defaultDownloadArtifact,
    extractZip = defaultExtractZip,
  } = options;

  if (overridePath) {
    return resolveElectronExecutable(desktopDirectory, overridePath, platform);
  }

  try {
    return resolveElectronExecutable(desktopDirectory, undefined, platform);
  } catch {
    // A missing runtime is recoverable. Continue with a clean download below.
  }

  const electronPackageDirectory = electronPackageDirectoryFor(desktopDirectory);
  const distDirectory = path.join(electronPackageDirectory, 'dist');
  const stagingDirectory = path.join(electronPackageDirectory, `.dist-download-${randomUUID()}`);
  const backupDirectory = path.join(electronPackageDirectory, `.dist-backup-${randomUUID()}`);
  const version = electronVersion ?? JSON.parse(
    await readFile(path.join(electronPackageDirectory, 'package.json'), 'utf8'),
  ).version;
  const mirror = environment.ELECTRON_MIRROR;
  const request = {
    version,
    artifactName: 'electron',
    platform,
    arch,
    ...(mirror ? { mirrorOptions: { mirror } } : {}),
  };
  let backupCreated = false;

  try {
    await mkdir(stagingDirectory, { recursive: true });
    const archive = await downloadArtifact(request);
    await extractZip(archive, { dir: stagingDirectory });

    const stagedExecutable = path.join(stagingDirectory, electronExecutableRelativePath(platform));
    if (!existsSync(stagedExecutable)) {
      throw new Error(`Downloaded Electron ${version} did not contain ${electronExecutableRelativePath(platform)}`);
    }

    if (existsSync(distDirectory)) {
      await rename(distDirectory, backupDirectory);
      backupCreated = true;
    }
    await rename(stagingDirectory, distDirectory);
    if (backupCreated) await rm(backupDirectory, { recursive: true, force: true });

    return resolveElectronExecutable(desktopDirectory, undefined, platform);
  } catch (error) {
    if (backupCreated && !existsSync(distDirectory) && existsSync(backupDirectory)) {
      await rename(backupDirectory, distDirectory);
    }
    // Do not include downloader errors here: a custom ELECTRON_MIRROR can carry
    // credentials and downloader messages often echo the source URL.
    throw new Error(
      `Unable to restore Electron runtime (${version}). Check network access or ELECTRON_MIRROR.`,
    );
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    if (existsSync(backupDirectory) && existsSync(distDirectory)) {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  }
};
