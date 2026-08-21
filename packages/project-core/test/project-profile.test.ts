import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadProjectProfile } from '../src/project-profile.js';
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

  it('rejects artifact paths outside the project task directory', () => {
    expect(() => new ArtifactStore('D:/work/.qt-ui-copilot/tasks/t1').resolve('../../secret.txt')).toThrow('Artifact path escapes task root');
  });
});
