import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/database.js';
import { SettingsRepository } from '../src/settings-repository.js';
import { TaskRepository } from '../src/task-repository.js';

describe('SettingsRepository', () => {
  it('stores multiple Qt kits and protects a referenced kit', () => {
    const database = openDatabase(':memory:');
    const repository = new SettingsRepository(database);
    new TaskRepository(database).upsertProject({ id: 'network-app', rootDir: 'D:/projects/network-app' });
    repository.saveQtKit({ id: 'qt59', displayName: 'Qt 5.9.6', config: { version: '5.9.6' } });
    repository.saveQtKit({ id: 'qt610', displayName: 'Qt 6.10.2', config: { version: '6.10.2' } });
    repository.saveProjectBinding({ projectId: 'network-app', qtKitId: 'qt59', config: { buildDirectory: 'build', executable: 'app.exe' } });
    expect(repository.listQtKits()).toHaveLength(2);
    expect(() => repository.deleteQtKit('qt59')).toThrow('1 project');
    expect(repository.getProjectBinding('network-app')?.qtKitId).toBe('qt59');
  });

  it('round-trips preferences and optional health data', () => {
    const repository = new SettingsRepository(openDatabase(':memory:'));
    repository.saveQtKit({ id: 'qt6', displayName: 'Qt 6', config: { bin: 'D:/Qt/bin' }, health: { ok: true }, checkedAt: 123 });
    repository.saveUiPreferences({ activeTheme: 'b1', tabs: ['workbench'] });
    expect(repository.getQtKit('qt6')?.health).toEqual({ ok: true });
    expect(repository.getUiPreferences()).toEqual({ activeTheme: 'b1', tabs: ['workbench'] });
  });
});
