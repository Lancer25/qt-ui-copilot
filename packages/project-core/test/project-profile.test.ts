import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadProjectConfig, loadProjectProfile, profileFromConfig } from '../src/project-profile.js';
import { ArtifactStore } from '../src/artifact-store.js';

describe('project profiles and artifacts', () => {
  it('loads a validated project profile from JSON', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-profile-'));
    const profilePath = path.join(directory, 'profile.json');

    try {
      writeFileSync(profilePath, JSON.stringify({
        id: 'demo', rootDir: directory,
        qt: { version: '5.9.6', uic: 'D:/Qt/bin/uic.exe', rcc: 'D:/Qt/bin/rcc.exe' },
        build: { command: { executable: 'cmake', args: ['--build', 'build'] } },
        run: { executable: 'D:/demo/demo.exe', args: [], environment: {} },
      }));

      expect(loadProjectProfile(profilePath)).toMatchObject({ id: 'demo', rootDir: directory, qt: { version: '5.9.6' } });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('loads the complete Qt6 fixture workflow profile when its kit is present', () => {
    const root = path.resolve(process.cwd(), '..', '..', 'fixtures', 'qt6-app');
    const config = loadProjectConfig(root);
    expect(config).toMatchObject({ id: 'qt6-fixture', qt: { version: '6.10.2', compilerAbi: 'msvc2022_64' } });
    expect(config?.preview.sourceDirectory).toContain(path.join('native', 'qt-ui-preview-host'));
    expect(config?.run).toMatchObject({
      routeId: 'network-settings',
      route: {
        id: 'network-settings',
        targetUi: 'NetworkSettings.ui',
        steps: [
          { kind: 'invoke', objectName: 'settingsButton' },
          { kind: 'invoke', objectName: 'networkButton' },
          { kind: 'waitForWidget', objectName: 'networkSettingsDialog' },
          { kind: 'waitForUi', objectName: 'networkSettingsDialog' },
        ],
      },
    });
    // The test documents configuration validity even on a contributor machine
    // without the optional fixture kit; native qualification checks existence.
    if (config) expect(existsSync(config.qt.uic) || process.platform !== 'win32').toBe(true);
  });

  it('keeps route metadata out of the strict launch profile', () => {
    const root = path.resolve(process.cwd(), '..', '..', 'fixtures', 'qt6-app');
    const config = loadProjectConfig(root);
    expect(config).toBeDefined();
    expect(profileFromConfig(root, config!)).toMatchObject({
      id: 'qt6-fixture',
      run: { executable: expect.stringContaining('qt-ui-copilot-qt6-fixture.exe') },
    });
    expect(profileFromConfig(root, config!).run).not.toHaveProperty('routeId');
  });

  it('derives build, preview and run settings from a Qt-Kit-only project file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-minimal-'));
    try {
      const internal = path.join(root, '.qt-ui-copilot');
      mkdirSync(internal, { recursive: true });
      writeFileSync(path.join(internal, 'project.json'), JSON.stringify({ id: 'demo', qt: { version: '6.10.2', uic: 'D:/Qt/bin/uic.exe', rcc: 'D:/Qt/bin/rcc.exe', binDirectory: 'D:/Qt/bin', compilerAbi: 'msvc2022_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: 'D:/Qt' } }));
      expect(loadProjectConfig(root)).toMatchObject({ id: 'demo', build: { backend: 'auto' }, preview: { width: 900 }, run: { executable: path.join(root, '.qt-ui-copilot', 'build', 'demo.exe') } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects artifact paths outside the project task directory', () => {
    expect(() => new ArtifactStore('D:/work/.qt-ui-copilot/tasks/t1').resolve('../../secret.txt')).toThrow('Artifact path escapes task root');
  });

  // A portable profile records the Qt identity but never tool paths: those
  // belong to the computer that owns the Qt installation. Executing such a
  // project therefore requires the machine-local toolchain the user bound.
  const boundQt = (root: string) => ({
    version: '5.9.6', uic: path.join(root, 'Qt5.9.6', 'bin', 'uic.exe'), rcc: path.join(root, 'Qt5.9.6', 'bin', 'rcc.exe'),
    binDirectory: path.join(root, 'Qt5.9.6', 'bin'),
    compilerAbi: 'msvc2015_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: path.join(root, 'Qt5.9.6'),
  });

  const portableProfile = (root: string) => {
    const internal = path.join(root, '.qt-ui-copilot');
    mkdirSync(internal, { recursive: true });
    writeFileSync(path.join(internal, 'project.json'), JSON.stringify({
      id: 'b06652c5-7ed3-48a9-b917-dda4e2eefb21',
      qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' },
      build: { backend: 'auto', directory: '.qt-ui-copilot/build' },
      run: { executable: '.qt-ui-copilot/build/Debug/b06652c5-7ed3-48a9-b917-dda4e2eefb21.exe' },
    }));
  };

  it('merges the bound machine-local toolchain into a portable project file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-portable-'));
    try {
      portableProfile(root);
      const config = loadProjectConfig(root, boundQt(root));
      expect(config?.qt).toMatchObject({ version: '5.9.6', uic: path.join(root, 'Qt5.9.6', 'bin', 'uic.exe'), binDirectory: path.join(root, 'Qt5.9.6', 'bin'), compilerAbi: 'msvc2015_64' });
      // cmake is a command looked up on PATH, never a project-relative file.
      expect(config?.qt.cmake).toBe('cmake');
      expect(config?.run.executable).toBe(path.join(root, '.qt-ui-copilot', 'build', 'Debug', 'b06652c5-7ed3-48a9-b917-dda4e2eefb21.exe'));
      expect(config?.build).toMatchObject({ backend: 'auto' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reports a portable project without a bound toolchain as unconfigured instead of throwing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-unbound-'));
    try {
      portableProfile(root);
      expect(loadProjectConfig(root)).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('keeps the whole toolchain a project file records for itself', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-local-file-'));
    try {
      const internal = path.join(root, '.qt-ui-copilot');
      mkdirSync(internal, { recursive: true });
      const recorded = { ...boundQt(root), version: '6.10.2', uic: path.join(root, 'Qt6', 'bin', 'uic.exe') };
      writeFileSync(path.join(internal, 'project.json'), JSON.stringify({ id: 'demo', qt: recorded }));
      expect(loadProjectConfig(root, boundQt(root))?.qt).toMatchObject({ version: '6.10.2', uic: recorded.uic });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('loads a project that has no profile file at all once a Qt Kit is bound', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-no-profile-'));
    try {
      expect(loadProjectConfig(root)).toBeUndefined();
      const config = loadProjectConfig(root, boundQt(root));
      expect(config?.id).toBe(path.basename(root));
      expect(config?.qt.uic).toBe(path.join(root, 'Qt5.9.6', 'bin', 'uic.exe'));
      expect(config?.run.executable).toBe(path.join(root, '.qt-ui-copilot', 'build', `${path.basename(root)}.exe`));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
