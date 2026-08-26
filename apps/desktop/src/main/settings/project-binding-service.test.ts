import { describe, expect, it } from 'vitest';
import { checkProjectBinding } from './project-binding-service';

describe('project binding service', () => {
  it('reports all missing prerequisites', () => {
    expect(checkProjectBinding({ projectId: 'p', qtKitId: 'q', config: {} }, { hasProject: () => false, hasQtKit: () => false })).toEqual({ ok: false, blocking: ['project_not_imported', 'qt_kit_not_found', 'build_directory_required', 'executable_required'] });
  });
  it('accepts a complete imported project binding', () => {
    expect(checkProjectBinding({ projectId: 'p', qtKitId: 'q', config: { buildDirectory: 'build', executable: 'app.exe' } }, { hasProject: () => true, hasQtKit: () => true })).toEqual({ ok: true, blocking: [] });
  });

  it('does not require build fields when the caller supplies defaults', () => {
    expect(checkProjectBinding({ projectId: 'p', qtKitId: 'q', config: { buildDirectory: '${projectRoot}/.qt-ui-copilot/build', executable: '${projectRoot}/.qt-ui-copilot/build/Debug/demo.exe' } }, { hasProject: () => true, hasQtKit: () => true })).toEqual({ ok: true, blocking: [] });
  });
});
