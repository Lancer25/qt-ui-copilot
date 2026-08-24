import { useEffect, useMemo, useState } from 'react';
import type { ComponentCandidate } from '@qt-ui-copilot/component-library';
import { ComponentCandidates } from './features/components/ComponentCandidates';
import { UiDiffPanel } from './features/diff/UiDiffPanel';
import { PreviewComparison } from './features/preview/PreviewComparison';
import { ProjectSidebar } from './features/projects/ProjectSidebar';
import { EvidenceReport, makeReportRequest } from './features/report/EvidenceReport';
import { WorkflowTimeline } from './features/workflow/WorkflowTimeline';
import { desktopApi, type DesktopApi, type ModelSettings, type UiProject, type WorkflowUiState } from './lib/api';
import { formatWorkflowFailure, sanitizeFailureMessage } from './lib/failure-display';
import './app.css';
import { AppShell } from './app/AppShell';
import { SettingsPage } from './pages/settings/SettingsPage';
import type { PrimaryNavigationId } from './app/navigation';
import type { AppTab } from './app/tabs/tab-model';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ComponentsPage } from './pages/components/ComponentsPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { ReportsPage } from './pages/reports/ReportsPage';

const workflowNodeOrder = ['IMPORT_PROJECT', 'SELECT_UI', 'CAPTURE_BASELINE', 'RETRIEVE_COMPONENTS', 'UNDERSTAND_REQUIREMENT', 'GENERATE_UI_PLAN', 'USER_APPROVAL', 'APPLY_CANDIDATE_PATCH', 'XML_VALIDATE', 'UIC_VALIDATE', 'ENHANCED_PREVIEW', 'DETERMINISTIC_CHECKS', 'VISUAL_REVIEW', 'OPTIONAL_REPAIR', 'INCREMENTAL_BUILD', 'LAUNCH_ISOLATED_EXE', 'NAVIGATE_TO_TARGET', 'PROBE_VERIFY_PAGE', 'CAPTURE_REAL_RESULT', 'FINAL_CHECKS', 'REPORT', 'ACCEPT_OR_ROLLBACK'] as const;
const workflowNodeIndex = (node: string): number => workflowNodeOrder.indexOf(node as typeof workflowNodeOrder[number]);

export function LegacyWorkbenchPage({ api = desktopApi() }: { api?: DesktopApi }) {
  const [project, setProject] = useState<UiProject>();
  const [targetUi, setTargetUi] = useState<string>();
  const [requirement, setRequirement] = useState('');
  const [task, setTask] = useState<WorkflowUiState>();
  const [candidates, setCandidates] = useState<ComponentCandidate[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<ComponentCandidate>();
  const [message, setMessage] = useState('');
  const [projectDirectory, setProjectDirectory] = useState('');
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelTest, setModelTest] = useState<{ ok: boolean; message?: string; warning?: string; elapsedMs: number }>();

  const acceptWorkflowState = (next: WorkflowUiState): void => {
    setTask((current) => {
      // The Main process publishes every durable transition and the start IPC
      // also returns the final snapshot. Chromium may deliver an older event
      // after that IPC promise resolves; never let a shorter event log rewind
      // the approval gate back to IMPORT_PROJECT/running.
      if (current && current.taskId === next.taskId && current.revision !== undefined && next.revision !== undefined && next.revision < current.revision) return current;
      if (current && current.taskId === next.taskId && next.events.length < current.events.length) return current;
      if (current && current.taskId === next.taskId && current.status === 'waiting_approval' && next.status === 'running' && workflowNodeIndex(next.node) < workflowNodeIndex(current.node)) return current;
      return next;
    });
  };
  useEffect(() => { void api.settings.getModel().then(setModelSettings); void api.projects.list().then((projects) => { const first = projects[0]; if (first) setProject(first); }).catch(() => undefined); return api.onWorkflowEvent(acceptWorkflowState); }, [api]);
  const canStart = Boolean(project && targetUi && requirement.trim());
  // The workflow machine remains the authority on whether approval is valid.
  // The renderer only needs a complete candidate and the approval node.  In
  // particular, status can briefly lag behind the node while an event is
  // being published; gating on it made a valid candidate look permanently
  // disabled in that window.
  const canApply = Boolean(task?.plan) && task?.status !== 'failed' && task?.status !== 'cancelled';
  const planSummary = useMemo(() => task?.plan && `${task.plan.summary}（${task.plan.operations.length} 项受控修改）`, [task?.plan]);
  const workflowFailure = formatWorkflowFailure(task?.failure);
  const alertMessage = [message, workflowFailure].filter(Boolean).map((item) => sanitizeFailureMessage(item!)).join(' · ');
  const call = async <T,>(action: () => Promise<T>): Promise<T | undefined> => { try { setMessage(''); return await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return undefined; } };
  const importProject = async (): Promise<void> => {
    let rootDir = projectDirectory.trim();
    if (!rootDir) {
      const selected = await call(() => api.projects.chooseDirectory());
      if (!selected) return;
      rootDir = selected;
      setProjectDirectory(selected);
    }
    const imported = await call(() => api.projects.import({ rootDir }));
    if (imported) { setProject(imported); setTargetUi(undefined); setTask(undefined); }
  };
  const selectUi = async (uiFile: string): Promise<void> => { setTargetUi(uiFile); setTask(undefined); setSelectedComponent(undefined); if (project) { const result = await call(() => api.components.search({ projectId: project.id, query: requirement })); if (result) setCandidates(result); } };
  const start = async (): Promise<void> => { if (!project || !targetUi) return; const result = await call(() => api.tasks.start({ projectId: project.id, targetUi, requirement })); if (!result) return; if (result.kind === 'configuration_required') { setMessage(result.message); setShowSettings(true); return; } setTask(result.state); const candidatesResult = await call(() => api.components.search({ projectId: project.id, query: requirement })); if (candidatesResult) setCandidates(candidatesResult); };
  const approve = async (): Promise<void> => {
    if (!canApply) {
      setMessage('当前没有可批准的候选修改计划。请先生成修改计划并等待任务进入审批状态。');
      return;
    }
    if (task) { const next = await call(() => api.tasks.approve({ taskId: task.taskId, approved: true })); if (next) setTask(next); }
  };
  const takeOver = async (): Promise<void> => { if (task) { await call(() => api.tasks.takeOver({ taskId: task.taskId })); setMessage('人工接管已请求：请在真实应用中完成导航，完成后继续任务。'); } };
  const cancel = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.cancel({ taskId: task.taskId })); if (next) setTask(next); } };
  const accept = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.accept({ taskId: task.taskId })); if (next) setTask(next); } };
  const rollback = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.rollback({ taskId: task.taskId })); if (next) setTask(next); } };
  const exportReport = async (): Promise<void> => { if (task) { const result = await call(() => api.reports.export(makeReportRequest(task, selectedComponent))); if (result && !result.cancelled) setMessage(`证据报告已导出：${result.path}`); } };
  const saveModel = async (): Promise<void> => { const baseUrl = modelSettings?.baseUrl ?? ''; const model = modelSettings?.model ?? ''; const next = await call(() => api.settings.configureModel({ baseUrl, model, apiKey: apiKey || undefined })); if (next) { setModelSettings(next); setApiKey(''); setShowSettings(false); } };
  const testModel = async (): Promise<void> => { const result = await call(() => api.settings.testModel()); if (result) setModelTest(result); };
  return <main className="app-shell">
    {alertMessage && <p role="alert" className="message" aria-live="assertive">{alertMessage}</p>}<div className="workbench"><div className="left-pane"><ProjectSidebar project={project} selectedUi={targetUi} onSelect={selectUi} /><ComponentCandidates candidates={candidates} selectedId={selectedComponent?.componentId} onSelect={setSelectedComponent} /></div>
      <section className="center-pane"><div className="request"><label htmlFor="requirement">界面需求</label><textarea id="requirement" value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：新增测试连接按钮，并保证英文小窗口不截断" /><button onClick={start} disabled={!canStart}>生成修改计划</button><button type="button" className="primary-action" onClick={approve} aria-disabled={!canApply} aria-describedby="apply-candidate-help" data-workflow-status={task?.status ?? 'none'} data-workflow-node={task?.node ?? 'none'} data-has-plan={String(Boolean(task?.plan))} data-can-apply={String(canApply)} data-workflow-revision={task?.revision ?? 'none'}>批准并应用候选修改</button><span id="apply-candidate-help" className="sr-only">批准当前结构化修改计划，并开始应用候选修改。</span></div>{planSummary && <section aria-label="结构化修改计划" className="plan"><h2>结构化修改计划</h2><p>{planSummary}</p><ul>{task?.plan?.operations.map((operation, index) => <li key={index}>{operation.op}</li>)}</ul></section>}<PreviewComparison beforeImage={task?.beforeImage} afterImage={task?.afterImage} quickImage={task?.quickImage} /></section>
      <WorkflowTimeline task={task} onTakeOver={takeOver} onCancel={cancel} onAccept={accept} onRollback={rollback} /></div><section className="bottom-pane"><UiDiffPanel before={task?.xmlBefore} after={task?.xmlAfter} findings={task?.deterministicFindings ?? []} visualFindings={task?.visualFindings ?? []} visualReviewStatus={task?.visualReviewStatus} evidence={task?.evidence ?? []} routeEvidence={task?.routeEvidence ?? []} /><EvidenceReport task={task} selectedComponent={selectedComponent} onExport={exportReport} /></section></main>;
}

export function App({ api = desktopApi() }: { api?: DesktopApi }) {
  const [activeNavigation, setActiveNavigation] = useState<PrimaryNavigationId>('workbench');
  const renderPage = (id: PrimaryNavigationId, openTab: (tab: AppTab) => void) => {
    switch (id) {
      case 'projects': return <ProjectsPage api={api} onOpenTab={openTab} />;
      case 'components': return <ComponentsPage api={api} onOpenTab={openTab} />;
      case 'tasks': return <TasksPage api={api} onOpenTab={openTab} />;
      case 'reports': return <ReportsPage api={api} onOpenTab={openTab} />;
      case 'settings': return <SettingsPage api={api} />;
      default: return <LegacyWorkbenchPage api={api} />;
    }
  };
  return <AppShell activeNavigation={activeNavigation} onNavigate={setActiveNavigation} renderPage={renderPage} />;
}
