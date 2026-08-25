import type { V3Repository } from '@qt-ui-copilot/task-store';

export function migrateToV3(repository: V3Repository): { migrated: boolean } {
  if (repository.getPreferences().v3MigrationVersion === 1) return { migrated: false };
  repository.savePreferences({ ...repository.getPreferences(), v3MigrationVersion: 1, migratedAt: Date.now() });
  return { migrated: true };
}
