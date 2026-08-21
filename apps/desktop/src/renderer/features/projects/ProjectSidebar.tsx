import type { UiProject } from '../../lib/api';

export function ProjectSidebar({ project, selectedUi, onSelect }: {
  project?: UiProject; selectedUi?: string; onSelect: (uiFile: string) => void;
}) {
  return <aside aria-label="项目与界面" className="sidebar">
    <h2>项目 / 界面</h2>
    {project ? <>
      <p className="muted" title={project.rootDir}>{project.rootDir}</p>
      <ul>{project.uiFiles.map((uiFile) => <li key={uiFile}>
        <button className={selectedUi === uiFile ? 'selected' : ''} onClick={() => onSelect(uiFile)}>{uiFile}</button>
      </li>)}</ul>
    </> : <p className="muted">导入 Qt 项目后选择 .ui 文件。</p>}
  </aside>;
}
