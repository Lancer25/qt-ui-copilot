import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('rejects artifact paths outside the project task directory', () => {
    expect(() => new ArtifactStore('D:/work/.qt-ui-copilot/tasks/t1').resolve('../../secret.txt')).toThrow('Artifact path escapes task root');
  });
});
