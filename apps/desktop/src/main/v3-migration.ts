import type { TaskRepository, V3Repository } from '@qt-ui-copilot/task-store';

/** Copy durable V2 project metadata into the V3 workspace index without
 * touching user source files. Secrets remain in the existing encrypted store. */
export function migrateToV3(repository: V3Repository, legacy?: TaskRepository): { migrated: boolean; workspaces: number } {
  if (repository.getPreferences().v3MigrationVersion === 1) return { migrated: false, workspaces: 0 };
  const projects = (legacy?.listProjects() ?? []).filter((item) => item.rootDir.trim().length > 0);
  const now = Date.now();
  for (const project of projects) {
    const existing = repository.getWorkspaceByRoot(project.rootDir);
    repository.saveWorkspace(existing ?? {
      id: `v3-${project.id}`,
      name: project.rootDir.split(/[\\/]/).filter(Boolean).at(-1) ?? project.id,
      rootDir: project.rootDir,
      fileCount: 0,
      lastOpenedAt: project.updatedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ...(project.profile && typeof project.profile === 'object' ? { profile: project.profile as Record<string, unknown> } : {}),
    });
  }
  const preferences = repository.getPreferences();
  repository.savePreferences({ ...preferences, v3MigrationVersion: 1, migratedAt: now, migratedWorkspaceCount: projects.length, ...(projects[0] ? { lastLegacyProjectId: projects[0].id } : {}) });
  return { migrated: true, workspaces: projects.length };
}
