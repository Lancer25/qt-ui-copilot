import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/database.js';
import { TaskRepository } from '../src/task-repository.js';

describe('TaskRepository', () => {
  it('resumes from the last completed safe node', () => {
    const database = openDatabase(':memory:');
    const repo = new TaskRepository(database);
    const id = repo.createTask('demo', 'Settings.ui');
    repo.appendEvent(id, { node: 'UIC_VALIDATE', status: 'completed', at: 10 });
    repo.appendEvent(id, { node: 'APPLY_CANDIDATE_PATCH', status: 'started', at: 11 });

    expect(repo.resumePoint(id)).toBe('UIC_VALIDATE');
    database.close();
  });

  it('persists projects, tasks, events, and artifacts after reopening a database', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-store-'));
    const databasePath = path.join(directory, 'tasks.sqlite');

    try {
      const firstDatabase = openDatabase(databasePath);
      const firstRepo = new TaskRepository(firstDatabase);
      firstRepo.upsertProject({ id: 'demo', rootDir: 'D:/demo', profilePath: 'D:/demo/qt-ui-copilot.json' });
      const taskId = firstRepo.createTask('demo', 'Settings.ui');
      firstRepo.appendEvent(taskId, { node: 'XML_VALIDATE', status: 'completed', at: 1, payload: { valid: true } });
      firstRepo.addArtifact(taskId, { kind: 'screenshot', relativePath: 'baseline.png', metadata: { width: 800 } });
      firstDatabase.close();

      const reopened = openDatabase(databasePath);
      const repo = new TaskRepository(reopened);
      expect(repo.getTask(taskId)).toMatchObject({ id: taskId, projectId: 'demo', targetUi: 'Settings.ui' });
      expect(repo.listEvents(taskId)).toEqual([
        expect.objectContaining({ node: 'XML_VALIDATE', status: 'completed', payload: { valid: true } }),
      ]);
      expect(repo.listArtifacts(taskId)).toEqual([
        expect.objectContaining({ kind: 'screenshot', relativePath: 'baseline.png', metadata: { width: 800 } }),
      ]);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('persists user-confirmed UI bindings and semantic routes by project', () => {
    const database = openDatabase(':memory:');
    const repo = new TaskRepository(database);
    repo.upsertProject({ id: 'demo', rootDir: 'D:/demo' });

    repo.saveUiBinding('demo', 'ui/Settings.ui', 'settings-runtime', { score: 0.86, confirmed: true });
    repo.saveRoute('demo', 'open-settings', { steps: [{ action: 'invoke', objectName: 'settingsButton' }] });

    expect(repo.getUiBinding('demo', 'ui/Settings.ui', 'settings-runtime')).toEqual({ score: 0.86, confirmed: true });
    expect(repo.getRoute('demo', 'open-settings')).toEqual({ steps: [{ action: 'invoke', objectName: 'settingsButton' }] });
    database.close();
  });
});
