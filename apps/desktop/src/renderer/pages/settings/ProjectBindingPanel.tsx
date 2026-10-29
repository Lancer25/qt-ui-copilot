import { useEffect, useMemo, useState } from 'react';
import type { DesktopApi, PortableProjectProfile, ProjectBinding, ProjectSummary, QtKit, UiProject, WorkspaceSummary } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { matchPortableQtKit } from '../../../shared/portable-qt-kit-match';

const normalizedRoot = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
const sameRoot = (left: string, right: string): boolean => normalizedRoot(left) === normalizedRoot(right);
const asText = (value: unknown): string => typeof value === 'string' ? value : '';

const defaultBindingConfig = (project: Pick<ProjectSummary, 'id'>) => ({
  buildDirectory: '${projectRoot}/.qt-ui-copilot/build',
  executable: `${'${projectRoot}'}/.qt-ui-copilot/build/Debug/${project.id}.exe`,
  args: [] as string[],
});

const portablePath = (value: string): string | undefined => {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\$\{projectRoot\}\/?/, '').replace(/^\.\//, '');
  return !normalized || /^[a-z]:\//i.test(normalized) || normalized.startsWith('/') || normalized.split('/').includes('..') ? undefined : normalized;
};

const portableProfileFor = (project: ProjectSummary | undefined, kit: QtKit | undefined, buildDirectory: string, executable: string): PortableProjectProfile | undefined => {
  if (!project || !kit?.compilerAbi || !kit.architecture) return undefined;
  const directory = portablePath(buildDirectory); const runExecutable = portablePath(executable);
  if (!directory || !runExecutable) return undefined;
  return { id: project.id, qt: { version: kit.version, qtMajor: kit.qtMajor, compilerAbi: kit.compilerAbi, architecture: kit.architecture }, build: { backend: 'auto', directory }, run: { executable: runExecutable } };
};

export function ProjectBindingPanel({ api, workspace, onProjectImported }: { api: DesktopApi; workspace?: WorkspaceSummary; onProjectImported?: (project: UiProject) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [kits, setKits] = useState<QtKit[]>([]);
  const [projectId, setProjectId] = useState('');
  const [qtKitId, setQtKitId] = useState('');
  const [buildDirectory, setBuildDirectory] = useState('');
  const [executable, setExecutable] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locallySaved, setLocallySaved] = useState(false);
  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId), [projectId, projects]);
  const selectedKit = useMemo(() => kits.find((kit) => kit.id === qtKitId), [kits, qtKitId]);
  const currentWorkspaceProject = useMemo(() => workspace ? projects.find((project) => sameRoot(project.rootDir, workspace.rootDir)) : undefined, [projects, workspace]);
  const profile = useMemo(() => portableProfileFor(selectedProject, selectedKit, buildDirectory, executable), [selectedProject, selectedKit, buildDirectory, executable]);
  const applyDefaults = (project: ProjectSummary | undefined, binding?: ProjectBinding) => {
    if (!project) return;
    const defaults = defaultBindingConfig(project);
    setBuildDirectory(asText(binding?.config.buildDirectory) || defaults.buildDirectory);
    setExecutable(asText(binding?.config.executable) || defaults.executable);
  };

  useEffect(() => {
    let active = true;
    void Promise.all([api.projects.list(), api.settings.qtKits?.list() ?? Promise.resolve([])]).then(async ([knownProjects, nextKits]) => {
      let resolvedProjects = knownProjects;
      let openedProject = workspace ? knownProjects.find((project) => sameRoot(project.rootDir, workspace.rootDir)) : undefined;
      if (workspace && !openedProject) {
        try {
          const imported = await api.projects.import({ rootDir: workspace.rootDir });
          resolvedProjects = await api.projects.list();
          openedProject = resolvedProjects.find((project) => project.id === imported.id || sameRoot(project.rootDir, workspace.rootDir));
        } catch { /* Folder browsing remains available even if import is unavailable. */ }
      }
      if (!active) return;
      const initialProject = openedProject ?? resolvedProjects[0];
      setProjects(resolvedProjects); setKits(nextKits); setProjectId(initialProject?.id ?? '');
      const saved = initialProject ? await api.settings.getProjectBinding(initialProject.id).catch(() => undefined) : undefined;
      if (!active) return;
      const savedKit = saved?.qtKitId ? nextKits.find((kit) => kit.id === saved.qtKitId) : undefined;
      const matchableKits = nextKits.filter((kit): kit is QtKit & { compilerAbi: string; architecture: string } => Boolean(kit.compilerAbi && kit.architecture));
      const profileMatch = matchPortableQtKit(workspace?.profile, matchableKits);
      const profileKit = profileMatch.status === 'matched' ? profileMatch.kit : undefined;
      const initialKit = savedKit ?? profileKit ?? (profileMatch.status === 'not_required' ? nextKits[0] : undefined);
      setQtKitId(initialKit?.id ?? '');
      applyDefaults(initialProject, saved); setLocallySaved(Boolean(savedKit));
      setMessage(!savedKit && profileMatch.status === 'binding_required' ? '项目需要绑定本机 Qt Kit；旧设备的工具路径不会被复用。' : '');
    }).catch(() => { if (active) setMessage('无法读取项目或 Qt Kit，请先检查本机配置。'); });
    return () => { active = false; };
  }, [api, workspace]);

  const markChanged = () => { setLocallySaved(false); setMessage(''); };
  const selectProject = async (nextProjectId: string) => {
    const project = projects.find((item) => item.id === nextProjectId);
    setProjectId(nextProjectId);
    const binding = project ? await api.settings.getProjectBinding(project.id).catch(() => undefined) : undefined;
    if (binding?.qtKitId && kits.some((kit) => kit.id === binding.qtKitId)) setQtKitId(binding.qtKitId);
    applyDefaults(project, binding); setLocallySaved(Boolean(binding)); setMessage('');
  };
  const saveLocalBinding = async () => {
    const binding: ProjectBinding = { projectId, qtKitId, config: { buildDirectory, executable, args: [] } };
    setBusy(true);
    try {
      const health = await api.settings.checkProjectBinding(binding);
      if (!health.ok) { setMessage(`本机绑定未保存：${health.blocking.join('、')}`); return; }
      await api.settings.saveProjectBinding(binding);
      setLocallySaved(true); setMessage('本机 Qt Kit 与运行配置已保存。项目目录尚未写入；如需跨设备共享，请同步到项目。');
    } catch { setMessage('本机绑定保存失败，请检查 Qt Kit、构建目录和目标程序。'); } finally { setBusy(false); }
  };
  const syncToProject = async () => {
    if (!workspace || !profile || !locallySaved || !api.workspace) return;
    setBusy(true);
    try {
      await api.workspace.syncProjectProfile(workspace.id, profile);
      window.dispatchEvent(new CustomEvent('v3:project-binding-saved', { detail: { workspaceId: workspace.id } }));
      setMessage('本机绑定已保存，项目配置已同步。同步内容不包含本机 Qt 工具路径。');
    } catch { setMessage('本机绑定已保存，但同步到项目失败。请检查项目目录写入权限后重试。'); } finally { setBusy(false); }
  };
  const importProject = async () => {
    const rootDir = await api.projects.chooseDirectory(); if (!rootDir) return;
    try {
      const project = await api.projects.import({ rootDir });
      setProjects(await api.projects.list()); setProjectId(project.id); applyDefaults({ ...project, health: undefined }); setLocallySaved(false);
      onProjectImported?.(project); setMessage('项目已导入。请保存本机绑定；需要共享时再同步到项目。');
    } catch { setMessage('项目导入失败，请检查选择的文件夹是否可访问。'); }
  };
  const kitLabel = (kit: QtKit) => `${kit.displayName} · ${kit.compilerAbi ?? kit.architecture ?? `Qt${kit.qtMajor}`} · ${kit.rootDir}`;
  const isCurrentWorkspaceProject = Boolean(workspace && selectedProject && sameRoot(selectedProject.rootDir, workspace.rootDir));
  const syncDisabledReason = !workspace ? '请先打开项目文件夹' : !isCurrentWorkspaceProject ? '只能同步当前打开的项目' : !locallySaved ? '请先保存本机绑定' : !profile ? '当前 Kit 或路径不能生成可移植项目配置' : '';
  return <Card className="settings-card" aria-label="项目绑定">
    <div className="settings-card__heading"><div><h2>项目绑定</h2><p className="muted">本机绑定用于当前电脑；项目同步仅保存可移植的 Qt 需求与相对路径。</p></div><div className="ui-cluster"><Button onClick={() => void importProject()}>导入项目</Button><Button variant="primary" loading={busy} disabled={!projectId || !qtKitId} onClick={() => void saveLocalBinding()}>保存本机绑定</Button><Button loading={busy} disabled={Boolean(syncDisabledReason)} title={syncDisabledReason || '将可移植配置同步到当前项目'} onClick={() => void syncToProject()}>同步到项目</Button></div></div>
    {workspace && currentWorkspaceProject && <p className="settings-inline-hint" role="status">当前打开的工作区已自动选中：{workspace.rootDir}</p>}
    {!workspace && <p className="settings-inline-hint" role="status">当前未打开工作区。可保存本机绑定；打开文件夹后才能同步到项目。</p>}
    <div className="settings-form-grid"><Field label="项目"><select value={projectId} onChange={(event) => void selectProject(event.target.value)}><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.rootDir}</option>)}</select></Field><Field label="Qt Kit"><select value={qtKitId} onChange={(event) => { setQtKitId(event.target.value); markChanged(); }}><option value="">选择 Qt Kit</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kitLabel(kit)}</option>)}</select></Field><Field label="构建目录"><input value={buildDirectory} onChange={(event) => { setBuildDirectory(event.target.value); markChanged(); }} placeholder="${projectRoot}/.qt-ui-copilot/build" /></Field><Field label="目标程序"><input value={executable} onChange={(event) => { setExecutable(event.target.value); markChanged(); }} placeholder="build/Debug/MyApp.exe" /></Field></div>
    {message && <p role="status" className="muted">{message}</p>}
  </Card>;
}
