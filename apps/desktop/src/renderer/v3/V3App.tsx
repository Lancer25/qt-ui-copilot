import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { UiCreationCandidate, V3StartTaskInput } from '@qt-ui-copilot/contracts';
import type { DesktopApi, V3PreviewRequest, WorkspaceFile, WorkspaceSummary } from '../lib/api';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { ArtifactTabs } from './artifacts/ArtifactTabs';
import { DiffTab } from './artifacts/DiffTab';
import { OutputTab } from './artifacts/OutputTab';
import { UiPreviewTab } from './artifacts/UiPreviewTab';
import { UiSourceTab } from './artifacts/UiSourceTab';
import { ProjectExplorer } from './explorer/ProjectExplorer';
import { WorkspaceShell, type WorkspaceActivity } from './shell/WorkspaceShell';
import { artifactTabsReducer, initialArtifactTabsState, type ArtifactTab } from './state/artifact-tabs';
import { TaskStreamProvider, useTaskStream } from './state/task-stream-store';
import { TaskConversationView } from './tasks/TaskConversationView';
import { TaskHistoryPanel } from './tasks/TaskHistoryPanel';
import './styles/v3.css';

const emptyTaskId = (workspace?: WorkspaceSummary) => workspace ? `workspace:${workspace.id}` : 'default';
const leafName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
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

function Titlebar({ api, workspace }: { api: DesktopApi; workspace?: WorkspaceSummary }) {
  return <header className="v3-windowbar"><div className="v3-window-brand"><span className="v3-brand-mark">Q</span><b>Qt UI Copilot</b>{workspace ? <small>{workspace.name}</small> : null}</div><div className="v3-window-controls"><button aria-label="最小化" onClick={() => api.window?.minimize()}>—</button><button aria-label="最大化或还原" onClick={() => void api.window?.toggleMaximize()}>□</button><button className="v3-window-close" aria-label="关闭窗口" onClick={() => api.window?.close()}>×</button></div></header>;
}

function previewRequest(workspace: WorkspaceSummary | undefined, filePath: string, mode: 'quick' | 'enhanced'): V3PreviewRequest | undefined {
  const profile = workspace?.profile as { qt?: Record<string, unknown>; preview?: Record<string, unknown> } | undefined;
  const qt = profile?.qt; const preview = profile?.preview;
  if (!workspace || !qt || !qt.version || !qt.binDirectory || !qt.uic || !qt.rcc || !qt.cmake || !qt.cmakePrefixPath) return undefined;
  return {
    uiFile: filePath,
    profile: { qtKitId: String(qt.id ?? qt.version), mode, width: Number(preview?.width ?? 900), height: Number(preview?.height ?? 640), locale: String(preview?.locale ?? 'zh_CN'), style: String(preview?.style ?? 'Fusion'), qrcFiles: Array.isArray(preview?.qrcFiles) ? preview.qrcFiles.map(String) : [], stylesheets: Array.isArray(preview?.stylesheets) ? preview.stylesheets.map(String) : [], fonts: Array.isArray(preview?.fonts) ? preview.fonts.map(String) : [], pluginPaths: Array.isArray(preview?.pluginPaths) ? preview.pluginPaths.map(String) : [], highDpiMode: 'project-default' },
    qt: { version: String(qt.version), compilerAbi: String(qt.compilerAbi ?? 'unknown'), architecture: String(qt.architecture ?? 'x86_64'), binDirectory: String(qt.binDirectory), uic: String(qt.uic), rcc: String(qt.rcc), cmake: String(qt.cmake), cmakePrefixPath: String(qt.cmakePrefixPath), ...(qt.cmakeGenerator ? { cmakeGenerator: String(qt.cmakeGenerator) } : {}) },
    sourceDirectory: String(preview?.sourceDirectory ?? workspace.rootDir), cacheDirectory: String(preview?.cacheDirectory ?? `${workspace.rootDir}/.qt-ui-copilot/cache`), outputImage: `${workspace.rootDir}/.qt-ui-copilot/v3-preview.png`,
  };
}

function ArtifactContent({ api, tab, workspace, selectedFile, candidate, onOpenPreview, shouldAutoOpenCandidate, onOpenDiff, onOpenSource, onOpenOutput, onCommit, onReject }: { api: DesktopApi; tab: ArtifactTab; workspace?: WorkspaceSummary; selectedFile?: WorkspaceFile; candidate?: UiCreationCandidate; onOpenPreview(candidate: UiCreationCandidate): void; shouldAutoOpenCandidate(candidate: UiCreationCandidate): boolean; onOpenDiff(candidate: UiCreationCandidate): void; onOpenSource(filePath: string, candidate?: UiCreationCandidate): void; onOpenOutput(taskId: string): void; onCommit(candidateId: string): Promise<void>; onReject(candidateId: string): Promise<void> }) {
  const stream = useTaskStream(tab.kind === 'task' || tab.kind === 'output' ? tab.taskId : undefined);
  if (tab.kind === 'task') return <TaskConversationView taskId={tab.taskId} shouldAutoOpenCandidate={shouldAutoOpenCandidate} createTaskInput={async (input) => {
    if (!workspace) throw new Error('请先打开一个 Qt 项目文件夹。');
    if (!selectedFile) return { kind: 'create', taskId: tab.taskId, request: { workspaceId: workspace.id, contextMode: input.contextMode, requirement: input.text, attachments: input.attachments, fileName: nextUiFileName(workspace), rootType: 'QWidget', directory: 'ui', qtKitId: String((workspace.profile?.qt as { id?: unknown; version?: unknown } | undefined)?.id ?? (workspace.profile?.qt as { version?: unknown } | undefined)?.version ?? 'project-kit'), useProjectResources: true, useComponentLibrary: true, capabilityCandidates: [] } };
    const uiContent = await api.workspace?.readText(workspace.id, selectedFile.absolutePath) ?? '';
    return { kind: 'modify', taskId: tab.taskId, request: { workspaceId: workspace.id, contextMode: input.contextMode, requirement: input.text, attachments: input.attachments, uiFile: selectedFile.absolutePath, uiContent } };
  }} onOpenPreview={onOpenPreview} onOpenDiff={onOpenDiff} onOpenOutput={onOpenOutput} onCommitCandidate={onCommit} onRejectCandidate={onReject} />;
  if (tab.kind === 'settings') return <main aria-label="设置"><SettingsPage api={api} workspace={workspace} central /></main>;
  if (tab.kind === 'preview') return <UiPreviewTab api={api} filePath={tab.filePath} candidate={candidate} buildPreviewRequest={(mode) => {
    const request = previewRequest(workspace, candidate?.stagedPath ?? tab.filePath, mode);
    if (!request) throw new Error('当前项目尚未配置可用的 Qt Kit。');
    return request;
  }} onOpenDiff={() => candidate && onOpenDiff(candidate)} onOpenSource={() => onOpenSource(tab.filePath, candidate)} onCommit={onCommit} onReject={onReject} />;
  if (tab.kind === 'source') return <UiSourceTab api={api} workspaceId={workspace?.id} filePath={tab.filePath ?? ''} fallbackSource={candidate?.source} />;
  if (tab.kind === 'diff') return <DiffTab before="" after={candidate?.source ?? ''} title={tab.title} />;
  return <OutputTab events={stream.task?.events} />;
}

function V3Content({ api }: { api: DesktopApi }) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary>(); const [files, setFiles] = useState<WorkspaceFile[]>([]); const [selectedFile, setSelectedFile] = useState<WorkspaceFile>();
  const [activity, setActivity] = useState<WorkspaceActivity>('explorer'); const [tabs, dispatchTabs] = useReducer(artifactTabsReducer, initialArtifactTabsState); const [candidates, setCandidates] = useState<Record<string, UiCreationCandidate | undefined>>({}); const [message, setMessage] = useState<string>(); const [revealPath, setRevealPath] = useState<string>(); const dismissedCandidates = useRef(new Set<string>());
  const openTask = useCallback((taskId: string, title = 'AI 任务') => dispatchTabs({ type: 'openTask', taskId, title }), []);
  const openFile = useCallback((file: WorkspaceFile) => { setSelectedFile(file); dispatchTabs({ type: 'openPreview', filePath: file.absolutePath, title: leafName(file.relativePath), temporary: false }); }, []);
  const openCandidate = useCallback((candidate: UiCreationCandidate) => { dismissedCandidates.current.delete(candidate.id); setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openPreview', filePath: candidate.targetPath, title: candidate.blueprint.fileName, temporary: true, candidateId: candidate.id }); }, []);
  const shouldAutoOpenCandidate = useCallback((candidate: UiCreationCandidate) => !dismissedCandidates.current.has(candidate.id), []);
  const openDiff = useCallback((candidate: UiCreationCandidate) => { setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openArtifact', kind: 'diff', title: `${candidate.blueprint.fileName} Diff`, filePath: candidate.targetPath }); }, []);
  const openSource = useCallback((filePath: string, candidate?: UiCreationCandidate) => { if (candidate) setCandidates((current) => ({ ...current, [candidate.id]: candidate })); dispatchTabs({ type: 'openArtifact', kind: 'source', title: `${leafName(filePath)} 源码`, filePath }); }, []);
  const openOutput = useCallback((taskId: string) => dispatchTabs({ type: 'openArtifact', kind: 'output', title: '任务日志', taskId }), []);
  const activateWorkspaceTask = (next: WorkspaceSummary) => { dispatchTabs({ type: 'close', id: 'task:default' }); openTask(emptyTaskId(next)); };
  const openFolder = async () => { if (!api.workspace) { setMessage('当前运行时未接入 V3 工作区服务。'); return; } const rootDir = await api.projects.chooseDirectory(); if (!rootDir) return; try { const next = await api.workspace.open({ rootDir }); setWorkspace(next); setFiles(next.files); setSelectedFile(undefined); activateWorkspaceTask(next); setActivity('explorer'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); } };
  const refreshWorkspace = useCallback(async () => { if (!workspace || !api.workspace) return; const next = await api.workspace.open({ rootDir: workspace.rootDir }); setWorkspace(next); setFiles(next.files); }, [api.workspace, workspace]);
  useEffect(() => api.workspace?.onChange((change) => { if (workspace && change.workspaceId === workspace.id && (change.type === 'changed' || change.type === 'created')) void refreshWorkspace(); }), [api.workspace, refreshWorkspace, workspace]);
  useEffect(() => { const handler = (event: Event) => { const rootDir = (event as CustomEvent<string>).detail; if (!rootDir || !api.workspace) return; void api.workspace.open({ rootDir }).then((next) => { setWorkspace(next); setFiles(next.files); activateWorkspaceTask(next); }).catch((reason) => setMessage(reason instanceof Error ? reason.message : String(reason))); }; window.addEventListener('v3:open-workspace', handler); return () => window.removeEventListener('v3:open-workspace', handler); }, [api.workspace]);
  const commit = async (candidateId: string) => {
    if (!api.ai?.commitUiCandidate) throw new Error('当前环境不支持保存界面草稿。');
    const result = await api.ai.commitUiCandidate(candidateId);
    const candidate = candidates[candidateId];
    if (workspace && api.workspace) {
      const next = await api.workspace.open({ rootDir: workspace.rootDir });
      setWorkspace(next); setFiles(next.files);
      const savedFile = next.files.find((file) => file.absolutePath === result.uiFile || file.relativePath === result.uiFile);
      if (savedFile) { setSelectedFile(savedFile); setRevealPath(savedFile.relativePath); }
      dispatchTabs({ type: 'openPreview', filePath: result.uiFile, title: savedFile ? leafName(savedFile.relativePath) : candidate?.blueprint.fileName ?? leafName(result.uiFile), temporary: false, candidateId });
    }
    setCandidates((current) => ({ ...current, [candidateId]: undefined }));
    setMessage('草稿已保存到项目。');
  };
  const reject = async (candidateId: string) => {
    await api.ai?.rejectUiCandidate(candidateId);
    setCandidates((current) => ({ ...current, [candidateId]: undefined }));
    const tab = tabs.tabs.find((item) => item.kind === 'preview' && item.candidateId === candidateId);
    if (tab) dispatchTabs({ type: 'close', id: tab.id });
    setMessage('已放弃界面草稿。');
  };
  const sidebar = activity === 'explorer' ? (!workspace ? <button className="v3-open-folder" onClick={() => void openFolder()}>打开文件夹</button> : <ProjectExplorer api={api} workspace={{ ...workspace, files }} revealPath={revealPath} onOpen={openFile} onMessage={setMessage} />) : activity === 'tasks' ? <TaskHistoryPanel api={api} projectId={workspace?.id} onOpenTask={openTask} /> : <div className="v3-activity-placeholder"><b>{activity === 'search' ? '搜索' : '组件库'}</b>{activity === 'search' ? <input aria-label="搜索项目" placeholder="搜索项目文件…" /> : <p>组件库候选会在这里显示。</p>}</div>;
  const changeActivity = (next: WorkspaceActivity) => {
    if (next === 'settings') {
      dispatchTabs({ type: 'openSettings' });
      return;
    }
    setActivity(next);
  };
  const closeTab = (id: string) => { const tab = tabs.tabs.find((item) => item.id === id); if (tab?.kind === 'preview' && tab.candidateId) dismissedCandidates.current.add(tab.candidateId); dispatchTabs({ type: 'close', id }); };
  return <WorkspaceShell titlebar={<Titlebar api={api} workspace={workspace} />} activity={activity} onActivityChange={changeActivity} sidebar={sidebar} workspace={<ArtifactTabs tabs={tabs.tabs} activeTabId={tabs.activeTabId} onActivate={(id) => dispatchTabs({ type: 'activate', id })} onClose={closeTab} renderTab={(tab) => <ArtifactContent api={api} tab={tab} workspace={workspace} selectedFile={selectedFile} candidate={candidateForTab(tab, candidates)} onOpenPreview={openCandidate} onOpenDiff={openDiff} onOpenSource={openSource} onOpenOutput={openOutput} onCommit={commit} onReject={reject} shouldAutoOpenCandidate={shouldAutoOpenCandidate} />} />}>{message ? <div role="status" className="v3-toast">{message}</div> : null}</WorkspaceShell>;
}

export function V3App({ api }: { api: DesktopApi }) { return <TaskStreamProvider api={api}><V3Content api={api} /></TaskStreamProvider>; }
