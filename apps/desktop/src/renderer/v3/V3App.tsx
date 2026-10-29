import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { UiCapabilityCandidate, UiCreationCandidate, V3StartTaskInput } from '@qt-ui-copilot/contracts';
import type { DesktopApi, QtKit, V3PreviewRequest, V3PreviewResult, WorkspaceFile, WorkspaceSummary } from '../lib/api';
import { localQtToolchainFromKit, matchPortableQtKit } from '../../shared/portable-qt-kit-match';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { ArtifactTabs } from './artifacts/ArtifactTabs';
import { DiffTab } from './artifacts/DiffTab';
import { OutputTab } from './artifacts/OutputTab';
import { UiPreviewTab } from './artifacts/UiPreviewTab';
import { UiSourceTab } from './artifacts/UiSourceTab';
import { ProjectExplorer } from './explorer/ProjectExplorer';
import { WorkspaceShell, type WorkspaceActivity } from './shell/WorkspaceShell';
import { V3Toast, type V3Notice } from './shell/V3Toast';
import { artifactTabsReducer, initialArtifactTabsState, type ArtifactTab } from './state/artifact-tabs';
import { TaskStreamProvider, useTaskStream } from './state/task-stream-store';
import { TaskConversationView } from './tasks/TaskConversationView';
import { TaskHistoryPanel } from './tasks/TaskHistoryPanel';
import { WorkspaceIcon } from './shell/WorkspaceIcon';
import { ComponentLibraryPanel } from './components/ComponentLibraryPanel';
import './styles/v3.css';
import './styles/workspace-polish.css';

const emptyTaskId = (workspace?: WorkspaceSummary) => workspace ? `workspace:${workspace.id}` : 'default';
const leafName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const normalizedFilePath = (value: string): string => value.replaceAll('\\', '/').toLowerCase();
const workspaceRelativePath = (root: string, filePath: string): string => { const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, ''); const normalized = filePath.replaceAll('\\', '/'); return normalized.startsWith(`${normalizedRoot}/`) ? normalized.slice(normalizedRoot.length + 1) : normalized; };
export const nextUiFileName = (workspace: WorkspaceSummary): string => {
  const existing = new Set(workspace.files.filter((file) => file.kind === 'ui').map((file) => leafName(file.relativePath).toLowerCase()));
  if (!existing.has('newwidget.ui')) return 'NewWidget.ui';
  let index = 2;
  while (existing.has(`newwidget_${index}.ui`)) index += 1;
  return `NewWidget_${index}.ui`;
};
const candidateForTab = (tab: ArtifactTab, candidates: Record<string, UiCreationCandidate | undefined>): UiCreationCandidate | undefined => {
  if (tab.kind === 'preview') return candidates[tab.candidateId ?? ''];
  const filePath = 'filePath' in tab ? tab.filePath : undefined;
  return filePath ? Object.values(candidates).find((item) => item?.targetPath === filePath) : undefined;
};
const aiCapability = (candidate: UiCapabilityCandidate): UiCapabilityCandidate => ({ capabilityId: candidate.capabilityId, displayName: candidate.displayName, kind: candidate.kind, description: candidate.description, tags: candidate.tags, dependencyStatus: candidate.dependencyStatus, reasons: candidate.reasons });
const kitsWithPortableFingerprint = (kits: QtKit[]) => kits.filter((kit): kit is QtKit & { compilerAbi: string; architecture: string } => Boolean(kit.compilerAbi && kit.architecture));
const profileId = (workspace: WorkspaceSummary): string | undefined => { const id = (workspace.profile as { id?: unknown } | undefined)?.id; return typeof id === 'string' && id.trim() ? id.trim() : undefined; };
/**
 * Resolves the Kit *this* device will build with, in the same order the main
 * process uses: the Kit the project is bound to, then the Kit matching the Qt
 * identity the project declares, then the default Kit. The project profile
 * stays portable — paths only ever come from a Kit installed here. A mismatch
 * still warns, but it must not leave the project unusable.
 */
const withCurrentDeviceQtKit = (workspace: WorkspaceSummary, kits: QtKit[], boundKitId?: string): { workspace: WorkspaceSummary; bindingRequired: boolean } => {
  const match = matchPortableQtKit(workspace.profile, kitsWithPortableFingerprint(kits));
  const kit = match.status === 'matched' ? match.kit : kits.find((candidate) => candidate.id === boundKitId) ?? kits.find((candidate) => candidate.isDefault) ?? kits[0];
  const toolchain = localQtToolchainFromKit(kit);
  if (!kit || !toolchain) return { workspace, bindingRequired: match.status === 'binding_required' };
  const profile = workspace.profile ?? {};
  const portableQt = profile.qt && typeof profile.qt === 'object' && !Array.isArray(profile.qt) ? profile.qt as Record<string, unknown> : {};
  return { workspace: { ...workspace, profile: { ...profile, qt: { ...portableQt, ...kit, ...toolchain } } }, bindingRequired: match.status === 'binding_required' };
};

function Titlebar({ api, workspace }: { api: DesktopApi; workspace?: WorkspaceSummary }) {
  return <header className="v3-windowbar"><div className="v3-window-brand"><span className="v3-brand-mark">Q</span><b>Qt UI Copilot</b>{workspace ? <small>{workspace.name}</small> : null}</div><div className="v3-window-controls"><button aria-label="最小化" onClick={() => api.window?.minimize()}><WorkspaceIcon name="minimize" /></button><button aria-label="最大化或还原" onClick={() => void api.window?.toggleMaximize()}><WorkspaceIcon name="maximize" /></button><button className="v3-window-close" aria-label="关闭窗口" onClick={() => api.window?.close()}><WorkspaceIcon name="window-close" /></button></div></header>;
}

function previewRequest(workspace: WorkspaceSummary | undefined, filePath: string, mode: 'quick' | 'enhanced'): V3PreviewRequest | undefined {
  const profile = workspace?.profile as { qt?: Record<string, unknown>; preview?: Record<string, unknown> } | undefined;
  // Gate on the toolchain the main process would compute instead of a
  // hand-written field list: `cmake` is never stored on a Kit, so demanding one
  // reported every correctly bound project as unconfigured.
  const qt = localQtToolchainFromKit(profile?.qt); const preview = profile?.preview;
  if (!workspace || !qt) return undefined;
  return {
    uiFile: filePath,
    profile: { qtKitId: String(profile?.qt?.id ?? qt.version), mode, width: Number(preview?.width ?? 900), height: Number(preview?.height ?? 640), locale: String(preview?.locale ?? 'zh_CN'), style: String(preview?.style ?? 'Fusion'), qrcFiles: Array.isArray(preview?.qrcFiles) ? preview.qrcFiles.map(String) : [], stylesheets: Array.isArray(preview?.stylesheets) ? preview.stylesheets.map(String) : [], fonts: Array.isArray(preview?.fonts) ? preview.fonts.map(String) : [], pluginPaths: Array.isArray(preview?.pluginPaths) ? preview.pluginPaths.map(String) : [], highDpiMode: 'project-default' },
    qt: { ...qt },
    sourceDirectory: String(preview?.sourceDirectory ?? workspace.rootDir), cacheDirectory: String(preview?.cacheDirectory ?? `${workspace.rootDir}/.qt-ui-copilot/cache`), outputImage: `${workspace.rootDir}/.qt-ui-copilot/v3-preview.png`,
  };
}

function ArtifactContent({ api, tab, workspace, selectedFile, candidate, capabilityCandidates, initialPreview, onPreviewResult, onOpenPreview, shouldAutoOpenCandidate, onOpenDiff, onOpenSource, onOpenOutput, onCommit, onReject }: { api: DesktopApi; tab: ArtifactTab; workspace?: WorkspaceSummary; selectedFile?: WorkspaceFile; candidate?: UiCreationCandidate; capabilityCandidates: UiCapabilityCandidate[]; initialPreview?: V3PreviewResult; onPreviewResult(filePath: string, result: V3PreviewResult): void; onOpenPreview(candidate: UiCreationCandidate): void; shouldAutoOpenCandidate(candidate: UiCreationCandidate): boolean; onOpenDiff(candidate: UiCreationCandidate): void; onOpenSource(filePath: string, candidate?: UiCreationCandidate): void; onOpenOutput(taskId: string): void; onCommit(candidateId: string): Promise<void>; onReject(candidateId: string): Promise<void> }) {
  const stream = useTaskStream(tab.kind === 'task' || tab.kind === 'output' ? tab.taskId : tab.kind === 'preview' && workspace ? emptyTaskId(workspace) : undefined);
  const currentCandidate = stream.task?.candidate ?? candidate;
  const activeCandidate = currentCandidate && tab.kind === 'preview' && currentCandidate.targetPath.toLowerCase() === tab.filePath.toLowerCase() ? currentCandidate : undefined;
  if (tab.kind === 'task') return <TaskConversationView taskId={tab.taskId} creationMode={!selectedFile} componentCount={capabilityCandidates.length} shouldAutoOpenCandidate={shouldAutoOpenCandidate} createTaskInput={async (input) => {
    if (!workspace) throw new Error('请先打开一个 Qt 项目文件夹。');
    if (!selectedFile) return { kind: 'create', taskId: tab.taskId, request: { workspaceId: workspace.id, contextMode: input.contextMode, requirement: input.text, attachments: input.attachments, fileName: nextUiFileName(workspace), rootType: 'QWidget', directory: 'ui', qtKitId: String((workspace.profile?.qt as { id?: unknown; version?: unknown } | undefined)?.id ?? (workspace.profile?.qt as { version?: unknown } | undefined)?.version ?? 'project-kit'), useProjectResources: true, useComponentLibrary: input.useComponentLibrary, createProject: input.createProject, buildBackend: input.buildBackend, capabilityCandidates: input.useComponentLibrary ? capabilityCandidates : [] } };
    if (stream.task?.candidate?.targetPath === selectedFile.absolutePath) return { kind: 'adjust', taskId: tab.taskId, request: { taskId: tab.taskId, candidateId: stream.task.candidate.id, uiFile: selectedFile.relativePath, uiContent: stream.task.candidate.source, requirement: input.text, contextMode: input.contextMode } };
    const uiContent = await api.workspace?.readText(workspace.id, selectedFile.absolutePath) ?? '';
    return { kind: 'modify', taskId: tab.taskId, request: { workspaceId: workspace.id, contextMode: input.contextMode, requirement: input.text, attachments: input.attachments, uiFile: selectedFile.absolutePath, uiContent } };
  }} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onOpenOutput={onOpenOutput} onCommitCandidate={onCommit} onRejectCandidate={onReject} />;
  if (tab.kind === 'settings') return <main aria-label="设置"><SettingsPage api={api} workspace={workspace} central /></main>;
  if (tab.kind === 'preview') return <UiPreviewTab api={api} filePath={tab.filePath} candidate={activeCandidate} initialResult={initialPreview} onPreviewResult={(result) => onPreviewResult(tab.filePath, result)} taskId={workspace ? emptyTaskId(workspace) : undefined} onAdjust={activeCandidate && workspace ? async (requirement, previewDataUrl) => { await stream.adjustTask({ taskId: emptyTaskId(workspace), candidateId: activeCandidate.id, uiFile: workspaceRelativePath(workspace.rootDir, activeCandidate.targetPath), uiContent: activeCandidate.source, requirement, contextMode: 'focused_ui', ...(previewDataUrl ? { previewDataUrl } : {}) }); } : undefined} buildPreviewRequest={(mode) => {
    const request = previewRequest(workspace, activeCandidate?.saved ? tab.filePath : activeCandidate?.stagedPath ?? tab.filePath, mode);
    if (!request) throw new Error('当前项目尚未配置可用的 Qt Kit。');
    return request;
  }} onOpenDiff={() => candidate && onOpenDiff(candidate)} onOpenSource={() => onOpenSource(tab.filePath, candidate)} onCommit={onCommit} onReject={onReject} />;
  if (tab.kind === 'source') return <UiSourceTab key={tab.filePath} api={api} workspaceId={workspace?.id} filePath={tab.filePath ?? ''} fallbackSource={candidate?.source} />;
  if (tab.kind === 'diff') return <DiffTab before="" after={candidate?.source ?? ''} title={tab.title} />;
  return <OutputTab events={stream.task?.events} />;
}

function V3Content({ api }: { api: DesktopApi }) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary>(); const [files, setFiles] = useState<WorkspaceFile[]>([]); const [selectedFile, setSelectedFile] = useState<WorkspaceFile>();
  const [activity, setActivity] = useState<WorkspaceActivity>('explorer'); const [tabs, dispatchTabs] = useReducer(artifactTabsReducer, initialArtifactTabsState); const [candidates, setCandidates] = useState<Record<string, UiCreationCandidate | undefined>>({}); const [selectedCapabilities, setSelectedCapabilities] = useState<UiCapabilityCandidate[]>([]); const [previewCache, setPreviewCache] = useState<Record<string, V3PreviewResult | undefined>>({}); const [notice, setNotice] = useState<V3Notice>(); const [revealPath, setRevealPath] = useState<string>(); const [kitBindingRequired, setKitBindingRequired] = useState(false); const dismissedCandidates = useRef(new Set<string>()); const autoOpenedCandidates = useRef(new Set<string>()); const noticeId = useRef(0);
  const rememberPreview = useCallback((filePath: string, result: V3PreviewResult) => setPreviewCache((current) => ({ ...current, [filePath.toLowerCase()]: result })), []);
  const showNotice = useCallback((text: string, tone: V3Notice['tone'] = 'info') => setNotice({ id: ++noticeId.current, text, tone }), []);
  const openTask = useCallback((taskId: string, title = 'AI 任务') => dispatchTabs({ type: 'openTask', taskId, title }), []);
  const openFile = useCallback((file: WorkspaceFile) => { if (file.kind === 'ui') { setSelectedFile(file); dispatchTabs({ type: 'openPreview', filePath: file.absolutePath, title: leafName(file.relativePath), temporary: false }); } else { dispatchTabs({ type: 'openArtifact', kind: 'source', filePath: file.absolutePath, title: leafName(file.relativePath) }); } }, []);
  const openCandidate = useCallback((candidate: UiCreationCandidate) => { dismissedCandidates.current.delete(candidate.id); setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openPreview', filePath: candidate.targetPath, title: candidate.blueprint.fileName, temporary: !candidate.saved, candidateId: candidate.id }); }, []);
  const shouldAutoOpenCandidate = useCallback((candidate: UiCreationCandidate) => { if (dismissedCandidates.current.has(candidate.id) || autoOpenedCandidates.current.has(candidate.id)) return false; autoOpenedCandidates.current.add(candidate.id); return true; }, []);
  const openDiff = useCallback((candidate: UiCreationCandidate) => { setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openArtifact', kind: 'diff', title: `${candidate.blueprint.fileName} Diff`, filePath: candidate.targetPath }); }, []);
  const openSource = useCallback((filePath: string, candidate?: UiCreationCandidate) => { if (candidate) setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openArtifact', kind: 'source', title: `${leafName(filePath)} 源码`, filePath }); }, []);
  const openOutput = useCallback((taskId: string) => dispatchTabs({ type: 'openArtifact', kind: 'output', title: '任务日志', taskId }), []);
  const activateWorkspaceTask = (next: WorkspaceSummary) => { dispatchTabs({ type: 'close', id: 'task:default' }); openTask(emptyTaskId(next)); };
  const applyWorkspace = useCallback(async (next: WorkspaceSummary): Promise<WorkspaceSummary> => {
    const kits = await api.settings.qtKits?.list?.().catch(() => []) ?? [];
    // The binding is what the user chose explicitly, so it outranks an inferred
    // match — the same precedence the main process resolves with.
    const projectId = profileId(next);
    const binding = projectId ? await api.settings.getProjectBinding?.(projectId).catch(() => undefined) : undefined;
    const resolved = withCurrentDeviceQtKit(next, kits, binding?.qtKitId);
    setWorkspace(resolved.workspace); setFiles(resolved.workspace.files); setKitBindingRequired(resolved.bindingRequired);
    return resolved.workspace;
  }, [api.settings.qtKits, api.settings.getProjectBinding]);
  const openFolder = async () => { if (!api.workspace) { showNotice('当前运行时未接入 V3 工作区服务。', 'error'); return; } const rootDir = await api.projects.chooseDirectory(); if (!rootDir) return; try { const next = await applyWorkspace(await api.workspace.open({ rootDir })); setSelectedFile(undefined); activateWorkspaceTask(next); setActivity('explorer'); } catch (reason) { showNotice(reason instanceof Error ? reason.message : String(reason), 'error'); } };
  const closeFolder = () => { setWorkspace(undefined); setFiles([]); setSelectedFile(undefined); setCandidates({}); setSelectedCapabilities([]); setPreviewCache({}); setRevealPath(undefined); setKitBindingRequired(false); dispatchTabs({ type: 'reset' }); showNotice('已关闭当前文件夹'); };
  const refreshWorkspace = useCallback(async () => { if (!workspace || !api.workspace) return; await applyWorkspace(await api.workspace.open({ rootDir: workspace.rootDir })); }, [api.workspace, applyWorkspace, workspace]);
  useEffect(() => api.workspace?.onChange((change) => { if (workspace && change.workspaceId === workspace.id && (change.type === 'changed' || change.type === 'created')) void refreshWorkspace(); }), [api.workspace, refreshWorkspace, workspace]);
  useEffect(() => { const handler = (event: Event) => { const rootDir = (event as CustomEvent<string>).detail; if (!rootDir || !api.workspace) return; void api.workspace.open({ rootDir }).then(applyWorkspace).then((next) => { activateWorkspaceTask(next); }).catch((reason) => showNotice(reason instanceof Error ? reason.message : String(reason), 'error')); }; window.addEventListener('v3:open-workspace', handler); return () => window.removeEventListener('v3:open-workspace', handler); }, [api.workspace, applyWorkspace, showNotice]);
  useEffect(() => { const handler = (event: Event) => { const workspaceId = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId; if (!workspace || workspace.id !== workspaceId) return; void api.ai?.resumeTaskStream(emptyTaskId(workspace)).then((result) => { if (!result.resumed) return; openTask(emptyTaskId(workspace)); setActivity('explorer'); showNotice('Qt Kit 已绑定，正在自动继续上次任务'); void refreshWorkspace(); }).catch((reason) => showNotice(reason instanceof Error ? reason.message : String(reason), 'error')); }; window.addEventListener('v3:project-binding-saved', handler); return () => window.removeEventListener('v3:project-binding-saved', handler); }, [api.ai, openTask, refreshWorkspace, showNotice, workspace]);
  const commit = async (candidateId: string) => {
    if (!api.ai?.commitUiCandidate) throw new Error('当前环境不支持保存界面草稿。');
    const result = await api.ai.commitUiCandidate(candidateId);
    const candidate = candidates[candidateId];
    if (workspace && api.workspace) {
      const next = await applyWorkspace(await api.workspace.open({ rootDir: workspace.rootDir }));
      const savedFile = next.files.find((file) => file.absolutePath === result.uiFile || file.relativePath === result.uiFile);
      if (savedFile) { setSelectedFile(savedFile); setRevealPath(savedFile.relativePath); }
      dispatchTabs({ type: 'openPreview', filePath: result.uiFile, title: savedFile ? leafName(savedFile.relativePath) : candidate?.blueprint.fileName ?? leafName(result.uiFile), temporary: false, candidateId });
    }
    setCandidates((current) => ({ ...current, [candidateId]: undefined }));
    showNotice('草稿已保存到项目。', 'success');
  };
  const reject = async (candidateId: string) => {
    await api.ai?.rejectUiCandidate(candidateId);
    setCandidates((current) => ({ ...current, [candidateId]: undefined }));
    const tab = tabs.tabs.find((item) => item.kind === 'preview' && item.candidateId === candidateId);
    if (tab) dispatchTabs({ type: 'close', id: tab.id });
    showNotice('已放弃界面草稿。');
  };
  const sidebar = activity === 'settings' ? undefined : activity === 'explorer' ? (!workspace ? <button className="v3-open-folder" onClick={() => void openFolder()}>打开文件夹</button> : <ProjectExplorer api={api} workspace={{ ...workspace, files }} revealPath={revealPath} onOpen={openFile} onMessage={(text) => showNotice(text, /失败|错误|无法|不支持/.test(text) ? 'error' : 'info')} onCloseWorkspace={closeFolder} />) : activity === 'tasks' ? <TaskHistoryPanel api={api} workspaceId={workspace?.id} onOpenTask={openTask} onStartNewTask={() => openTask(emptyTaskId(workspace))} /> : activity === 'components' ? <ComponentLibraryPanel api={api} workspace={workspace} selected={selectedCapabilities} onToggle={(candidate) => setSelectedCapabilities((current) => current.some((item) => item.capabilityId === candidate.capabilityId) ? current.filter((item) => item.capabilityId !== candidate.capabilityId) : [...current, aiCapability(candidate)].slice(-8))} onClear={() => setSelectedCapabilities([])} onOpenSettings={() => { setActivity('settings'); dispatchTabs({ type: 'openSettings' }); }} /> : <div className="v3-activity-placeholder"><b>搜索</b><input aria-label="搜索项目" placeholder="搜索项目文件…" /></div>;
  const changeActivity = (next: WorkspaceActivity) => {
    setActivity(next);
    if (next === 'settings') {
      dispatchTabs({ type: 'openSettings' });
    }
  };
  const activateTab = (id: string) => { const tab = tabs.tabs.find((item) => item.id === id); if (tab?.kind === 'settings') setActivity('settings'); else if (activity === 'settings') setActivity('explorer'); dispatchTabs({ type: 'activate', id }); };
  const closeTab = (id: string) => { const tab = tabs.tabs.find((item) => item.id === id); if (tab?.kind === 'preview' && tab.candidateId) dismissedCandidates.current.add(tab.candidateId); if (tab?.kind === 'preview' && !tab.temporary && selectedFile && normalizedFilePath(tab.filePath) === normalizedFilePath(selectedFile.absolutePath)) setSelectedFile(undefined); if (tab?.kind === 'settings' && activity === 'settings') setActivity('explorer'); dispatchTabs({ type: 'close', id }); };
  return <WorkspaceShell titlebar={<Titlebar api={api} workspace={workspace} />} activity={activity} onActivityChange={changeActivity} sidebar={sidebar} workspace={<>{kitBindingRequired ? <div className="v3-kit-binding-required" role="status"><span>需要绑定本机 Qt Kit，才能在此设备预览或构建项目。</span><button type="button" onClick={() => changeActivity('settings')}>前往绑定</button></div> : null}<ArtifactTabs tabs={tabs.tabs} activeTabId={tabs.activeTabId} onActivate={activateTab} onClose={closeTab} renderTab={(tab) => <ArtifactContent api={api} tab={tab} workspace={workspace} selectedFile={selectedFile} candidate={candidateForTab(tab, candidates)} capabilityCandidates={selectedCapabilities} initialPreview={tab.kind === 'preview' ? previewCache[tab.filePath.toLowerCase()] : undefined} onPreviewResult={rememberPreview} onOpenPreview={openCandidate} onOpenDiff={openDiff} onOpenSource={openSource} onOpenOutput={openOutput} onCommit={commit} onReject={reject} shouldAutoOpenCandidate={shouldAutoOpenCandidate} />} /></>} >{notice ? <V3Toast key={notice.id} notice={notice} onDismiss={() => setNotice(undefined)} /> : null}</WorkspaceShell>;
}

export function V3App({ api }: { api: DesktopApi }) { return <TaskStreamProvider api={api}><V3Content api={api} /></TaskStreamProvider>; }
