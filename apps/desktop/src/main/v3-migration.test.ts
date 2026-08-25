import { describe, expect, it } from 'vitest';
import { openDatabase, TaskRepository, V3Repository } from '@qt-ui-copilot/task-store';
import { migrateToV3 } from './v3-migration';
describe('V3 migration', () => {
  it('is idempotent and carries legacy project metadata into the V3 workspace index', () => {
    const database = openDatabase(':memory:'); const repository = new V3Repository(database); const legacy = new TaskRepository(database);
    legacy.upsertProject({ id: 'legacy-project', rootDir: 'D:/qt-app', profile: { qt: { version: '5.9.6' } } });
    expect(migrateToV3(repository, legacy)).toMatchObject({ migrated: true, workspaces: 1 });
    expect(repository.listWorkspaces()[0]).toMatchObject({ rootDir: 'D:/qt-app', profile: { qt: { version: '5.9.6' } } });
    expect(migrateToV3(repository, legacy)).toMatchObject({ migrated: false });
    expect(repository.listWorkspaces()).toHaveLength(1);
  });
});
