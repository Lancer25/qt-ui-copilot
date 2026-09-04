export interface ProjectBindingInput { projectId: string; qtKitId: string; config: Record<string, unknown>; }
export interface ProjectBindingDependencies { hasProject(projectId: string): boolean; hasQtKit(qtKitId: string): boolean; }
export interface ProjectBindingHealth { ok: boolean; blocking: string[]; }

export function checkProjectBinding(input: ProjectBindingInput, dependencies: ProjectBindingDependencies): ProjectBindingHealth {
  const blocking: string[] = [];
  if (!dependencies.hasProject(input.projectId)) blocking.push('project_not_imported');
  if (!dependencies.hasQtKit(input.qtKitId)) blocking.push('qt_kit_not_found');
  if (typeof input.config.buildDirectory !== 'string' || !input.config.buildDirectory) blocking.push('build_directory_required');
  if (typeof input.config.executable !== 'string' || !input.config.executable) blocking.push('executable_required');
  if (input.config.buildBackend !== undefined && !['qmake', 'msbuild', 'auto'].includes(String(input.config.buildBackend))) blocking.push('build_backend_invalid');
  return { ok: blocking.length === 0, blocking };
}
