import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/project-scan.js';

describe('scanProject', () => {
  it('discovers supported project assets while excluding build outputs, oversized files, and escaping symlinks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-scan-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-outside-'));

    try {
      mkdirSync(path.join(root, 'ui'));
      mkdirSync(path.join(root, 'styles'));
      mkdirSync(path.join(root, 'fonts'));
      mkdirSync(path.join(root, 'build'));
      writeFileSync(path.join(root, 'ui', 'Settings.ui'), '<ui/>');
      writeFileSync(path.join(root, 'resources.qrc'), '<RCC/>');
      writeFileSync(path.join(root, 'styles', 'app.qss'), 'QWidget {}');
      writeFileSync(path.join(root, 'fonts', 'app.ttf'), 'font');
      writeFileSync(path.join(root, 'CMakePresets.json'), '{}');
      writeFileSync(path.join(root, 'demo.pro'), 'TEMPLATE = app');
      writeFileSync(path.join(root, 'demo.exe'), 'binary');
      writeFileSync(path.join(root, 'build', 'ignored.ui'), '<ui/>');
      writeFileSync(path.join(root, 'large.qss'), Buffer.alloc(16 * 1024 * 1024 + 1));
      writeFileSync(path.join(outside, 'outside.ui'), '<ui/>');
      try { symlinkSync(path.join(outside, 'outside.ui'), path.join(root, 'outside.ui')); } catch { /* Windows may require symlink privileges. */ }

      expect(scanProject(root)).toEqual({
        rootDir: path.resolve(root),
        uiFiles: [path.join(root, 'ui', 'Settings.ui')],
        qrcFiles: [path.join(root, 'resources.qrc')],
        qssFiles: [path.join(root, 'styles', 'app.qss')],
        fontFiles: [path.join(root, 'fonts', 'app.ttf')],
        cmakePresetFiles: [path.join(root, 'CMakePresets.json')],
        qmakeProjectFiles: [path.join(root, 'demo.pro')],
        executableCandidates: [path.join(root, 'demo.exe')],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
