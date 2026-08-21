import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CandidateFile } from '../src/index.js';

describe('CandidateFile', () => {
  it('restores byte-identical original bytes after rollback', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-candidate-'));
    const filePath = path.join(directory, 'Settings.ui');
    const originalBytes = Buffer.from([0x3c, 0x75, 0x69, 0x3e, 0xff, 0x3c, 0x2f, 0x75, 0x69, 0x3e]);
    writeFileSync(filePath, originalBytes);
    try {
      const file = await CandidateFile.open(filePath);
      await file.stage('<ui>changed</ui>');
      await file.rollback();
      expect(readFileSync(filePath)).toEqual(originalBytes);
      await file.rollback();
      expect(readFileSync(filePath)).toEqual(originalBytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not accept a staged candidate without explicit approval', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-candidate-'));
    const filePath = path.join(directory, 'Settings.ui');
    writeFileSync(filePath, '<ui/>');
    try {
      const file = await CandidateFile.open(filePath);
      await file.stage('<ui><class>Changed</class></ui>');
      await expect(file.accept({ approved: false })).rejects.toThrow('approval');
      await file.accept({ approved: true });
      expect(readFileSync(filePath, 'utf8')).toContain('Changed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
