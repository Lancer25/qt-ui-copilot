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

export function App({ api = desktopApi() }: { api?: DesktopApi }) {
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

  useEffect(() => { void api.settings.getModel().then(setModelSettings); return api.onWorkflowEvent(setTask); }, [api]);
  const canStart = Boolean(project && targetUi && requirement.trim());
  const canApply = task?.status === 'waiting_approval' && task.node === 'USER_APPROVAL';
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
  const approve = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.approve({ taskId: task.taskId, approved: true })); if (next) setTask(next); } };
  const takeOver = async (): Promise<void> => { if (task) { await call(() => api.tasks.takeOver({ taskId: task.taskId })); setMessage('人工接管已请求：请在真实应用中完成导航，完成后继续任务。'); } };
  const cancel = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.cancel({ taskId: task.taskId })); if (next) setTask(next); } };
  const accept = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.accept({ taskId: task.taskId })); if (next) setTask(next); } };
  const rollback = async (): Promise<void> => { if (task) { const next = await call(() => api.tasks.rollback({ taskId: task.taskId })); if (next) setTask(next); } };
  const exportReport = async (): Promise<void> => { if (task) { const result = await call(() => api.reports.export(makeReportRequest(task, selectedComponent))); if (result && !result.cancelled) setMessage(`证据报告已导出：${result.path}`); } };
  const saveModel = async (): Promise<void> => { const baseUrl = modelSettings?.baseUrl ?? ''; const model = modelSettings?.model ?? ''; const next = await call(() => api.settings.configureModel({ baseUrl, model, apiKey: apiKey || undefined })); if (next) { setModelSettings(next); setApiKey(''); setShowSettings(false); } };
  const testModel = async (): Promise<void> => { const result = await call(() => api.settings.testModel()); if (result) setModelTest(result); };
  return <main className="app-shell"><header><div><h1>Qt UI Copilot</h1><p>真实 Qt 运行验证驱动的界面开发助手</p></div><div className="import-project"><button onClick={() => setShowSettings((value) => !value)}>模型设置</button><label htmlFor="project-directory">项目目录</label><input id="project-directory" value={projectDirectory} onChange={(event) => setProjectDirectory(event.target.value)} placeholder="D:\\projects\\qt-app" /><button onClick={importProject}>{projectDirectory.trim() ? '导入项目' : '选择项目目录'}</button></div></header>
    {showSettings && <section aria-label="模型设置" className="model-settings"><label>Base URL<input value={modelSettings?.baseUrl ?? ''} onChange={(event) => setModelSettings((old) => ({ baseUrl: event.target.value, model: old?.model ?? '', hasApiKey: old?.hasApiKey ?? false, hasPersistentApiKey: old?.hasPersistentApiKey }))} placeholder="https://api.example.com/v1" /></label><label>模型<input value={modelSettings?.model ?? ''} onChange={(event) => setModelSettings((old) => ({ baseUrl: old?.baseUrl ?? '', model: event.target.value, hasApiKey: old?.hasApiKey ?? false, hasPersistentApiKey: old?.hasPersistentApiKey }))} /></label><label>API Key（仅 Main 进程安全存储）<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={modelSettings?.hasApiKey ? '已配置，留空不修改' : '可选'} /></label>{modelSettings?.storageWarning && <p role="status">{modelSettings.storageWarning}</p>}<button onClick={saveModel}>保存模型设置</button><button type="button" onClick={testModel}>测试连接</button>{modelTest && <p role="status">{modelTest.ok ? `连接成功（${modelTest.elapsedMs} ms）` : `连接失败：${modelTest.message ?? '未知错误'}`}{modelTest.warning ? ` ${modelTest.warning}` : ''}</p>}</section>}
    {alertMessage && <p role="alert" className="message" aria-live="assertive">{alertMessage}</p>}<div className="workbench"><div className="left-pane"><ProjectSidebar project={project} selectedUi={targetUi} onSelect={selectUi} /><ComponentCandidates candidates={candidates} selectedId={selectedComponent?.componentId} onSelect={setSelectedComponent} /></div>
      <section className="center-pane"><div className="request"><label htmlFor="requirement">界面需求</label><textarea id="requirement" value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：新增测试连接按钮，并保证英文小窗口不截断" /><button onClick={start} disabled={!canStart}>生成修改计划</button><button type="button" className="primary-action" onClick={approve} disabled={!canApply} aria-describedby="apply-candidate-help">批准并应用候选修改</button><span id="apply-candidate-help" className="sr-only">批准当前结构化修改计划，并开始应用候选修改。</span></div>{planSummary && <section aria-label="结构化修改计划" className="plan"><h2>结构化修改计划</h2><p>{planSummary}</p><ul>{task?.plan?.operations.map((operation, index) => <li key={index}>{operation.op}</li>)}</ul></section>}<PreviewComparison beforeImage={task?.beforeImage} afterImage={task?.afterImage} quickImage={task?.quickImage} /></section>
      <WorkflowTimeline task={task} onTakeOver={takeOver} onCancel={cancel} onAccept={accept} onRollback={rollback} /></div><section className="bottom-pane"><UiDiffPanel before={task?.xmlBefore} after={task?.xmlAfter} findings={task?.deterministicFindings ?? []} visualFindings={task?.visualFindings ?? []} routeEvidence={task?.routeEvidence ?? []} /><EvidenceReport task={task} selectedComponent={selectedComponent} onExport={exportReport} /></section></main>;
}
