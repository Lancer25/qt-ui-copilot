import type { DesktopApi, UiProject } from '../../lib/api';
import { WorkbenchPage as LegacyWorkbenchPage } from '../../App';

/**
 * V2 page boundary for the existing workflow. The legacy controller remains
 * intentionally intact while the visual pieces are extracted incrementally;
 * this boundary lets AppShell and future page-local state depend on a stable
 * page contract without changing Main IPC semantics.
 */
export function WorkbenchPage({ api, project, onProjectChange, onOpenSettings }: {
  api?: DesktopApi;
  project?: UiProject;
  onProjectChange?: (project?: UiProject) => void;
  onOpenSettings?: () => void;
}) {
  void project;
  void onProjectChange;
  void onOpenSettings;
  return <LegacyWorkbenchPage api={api} />;
}
