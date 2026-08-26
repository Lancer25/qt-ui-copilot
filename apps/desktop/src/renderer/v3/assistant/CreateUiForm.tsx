import { useMemo, useState } from 'react';
import type { DesktopApi, UiCreationRequest, UiCreationResult, WorkspaceSummary } from '../../lib/api';
import type { AiAttachment } from './attachment-reader';

export interface CreateUiFormProps {
  api: DesktopApi;
  workspace?: WorkspaceSummary;
  attachments: readonly AiAttachment[];
  onCommitted: (uiFile: string) => void;
  onMessage?: (message: string) => void;
  contextMode?: 'focused_ui' | 'whole_project';
  onContextModeChange?: (mode: 'focused_ui' | 'whole_project') => void;
}

/** Controls the explicit image-to-Qt-Widgets creation workflow. */
export function CreateUiForm({ api, workspace, attachments, onCommitted, onMessage, contextMode, onContextModeChange }: CreateUiFormProps) {
  const [fileName, setFileName] = useState('NewWidget.ui');
  const [rootType, setRootType] = useState<UiCreationRequest['rootType']>('QWidget');
  const [directory, setDirectory] = useState('ui');
  const [useProjectResources, setUseProjectResources] = useState(true);
  const [useComponentLibrary, setUseComponentLibrary] = useState(true);
  const [requirement, setRequirement] = useState('');
  const [localContextMode, setLocalContextMode] = useState<'focused_ui' | 'whole_project'>('focused_ui');
  const [candidate, setCandidate] = useState<UiCreationResult>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const effectiveContextMode = contextMode ?? localContextMode; const changeContextMode = (mode: 'focused_ui' | 'whole_project') => { setLocalContextMode(mode); onContextModeChange?.(mode); };
  const qtKitId = useMemo(() => String((workspace?.profile?.qt as { version?: unknown } | undefined)?.version ?? 'project-kit'), [workspace]);
  // A Qt kit is enough to generate and uic-check a new UI.  PreviewHost/QSS/QRC
  // are enhancement settings and must not block the first-use workflow.
  const hasQtKit = Boolean(workspace?.profile?.qt);
  const canGenerate = Boolean(workspace && hasQtKit && api.ai?.createUiCandidate && (requirement.trim() || attachments.some((item) => item.kind === 'image')) && fileName.toLowerCase().endsWith('.ui') && !busy);

  const generate = async () => {
    if (!workspace || !api.ai?.createUiCandidate || !canGenerate) return;
    setBusy(true); setCandidate(undefined); setProgress('正在准备参考图与项目上下文…');
    const steps = ['正在分析参考图与需求…', '正在生成 Qt Widgets 蓝图…', '正在生成 .ui XML…', '正在执行 uic 校验…', '正在准备预览结果…']; let index = 0;
    const timer = window.setInterval(() => { index = Math.min(index + 1, steps.length - 1); setProgress(steps[index]); }, 900);
    try {
      const result = await api.ai.createUiCandidate({ workspaceId: workspace.id, contextMode: effectiveContextMode, requirement: requirement.trim(), attachments: [...attachments], fileName, rootType, directory, qtKitId, useProjectResources, useComponentLibrary });
      setCandidate(result); onMessage?.('界面草稿已生成，请检查预览并审批保存。');
    } catch (error) { onMessage?.(error instanceof Error ? error.message : String(error)); }
    finally { window.clearInterval(timer); setBusy(false); setProgress(''); }
  };
  const reject = async () => {
    if (!candidate || !api.ai?.rejectUiCandidate) return;
    await api.ai.rejectUiCandidate(candidate.id).catch((error) => onMessage?.(error instanceof Error ? error.message : String(error)));
    setCandidate(undefined); onMessage?.('已丢弃界面草稿，可继续调整需求。');
  };
  const commit = async () => {
    if (!candidate || !api.ai?.commitUiCandidate) return;
    setBusy(true);
    try { const result = await api.ai.commitUiCandidate(candidate.id); setCandidate(undefined); onCommitted(result.uiFile); onMessage?.('界面已保存并打开。'); }
    catch (error) { onMessage?.(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  if (!workspace) return <div className="v3-create-empty">请先打开一个 Qt 项目文件夹。</div>;
  return <section className="v3-create-form" aria-label="创建新界面">
    <div className="v3-create-heading"><div><b>创建新界面</b><small>从参考图和需求生成 Qt Widgets .ui 草稿</small></div><span className="v3-create-badge">草稿模式</span></div>
    <fieldset disabled={busy} className="v3-create-fields"><label>新 UI 文件名<input aria-label="新 UI 文件名" value={fileName} onChange={(event) => setFileName(event.target.value)} /></label>
    <div className="v3-create-grid"><label>根窗口<select aria-label="根窗口类型" value={rootType} onChange={(event) => setRootType(event.target.value as UiCreationRequest['rootType'])}><option value="QWidget">QWidget</option><option value="QDialog">QDialog</option><option value="QMainWindow">QMainWindow</option></select></label><label>保存目录<input aria-label="保存目录" value={directory} onChange={(event) => setDirectory(event.target.value)} /></label></div>
    <label>界面需求<textarea aria-label="新界面需求" value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：创建一个登录窗口，包含账号、密码和登录按钮" /></label>
    <div className="v3-create-context"><span>AI 上下文</span><button type="button" className={effectiveContextMode === 'focused_ui' ? 'is-active' : ''} onClick={() => changeContextMode('focused_ui')}>专注界面</button><button type="button" className={effectiveContextMode === 'whole_project' ? 'is-active' : ''} onClick={() => changeContextMode('whole_project')}>整体模式</button></div><div className="v3-create-options"><label><input type="checkbox" checked={useProjectResources} onChange={(event) => setUseProjectResources(event.target.checked)} /> 使用项目 QSS/QRC</label><label><input type="checkbox" checked={useComponentLibrary} onChange={(event) => setUseComponentLibrary(event.target.checked)} /> 检索组件库</label></div></fieldset>
    {!hasQtKit && <p className="v3-create-warning" role="status">请先在设置中选择当前项目的 Qt Kit。</p>}
    {hasQtKit && !workspace?.profile?.preview && <p className="v3-create-hint" role="status">已使用 Qt Kit。PreviewHost、QSS/QRC 可稍后在设置中补充，当前仍可生成并校验 UI。</p>}
    {busy && <p className="v3-create-progress" role="status"><span className="v3-progress-dot" />{progress || '处理中…'}</p>}
    <button className="v3-create-primary" disabled={!canGenerate} onClick={() => void generate()}>{busy ? '处理中…' : '生成界面草稿'}</button>
    {candidate && <div className="v3-create-candidate" aria-label="界面草稿候选"><div className="v3-create-candidate-title"><b>{candidate.blueprint.fileName}</b><span>{candidate.blueprint.rootType} · {candidate.blueprint.expectedResults.length} 项预期结果</span></div>{candidate.previewDataUrl ? <img src={candidate.previewDataUrl} alt="新界面草稿预览" /> : <div className="v3-create-no-preview">暂无预览图</div>}<div className="v3-create-validation"><span className={candidate.validation.uic ? 'is-ok' : 'is-error'}>uic {candidate.validation.uic ? '通过' : '失败'}</span><span className={candidate.validation.preview ? 'is-ok' : candidate.validation.uic ? 'is-warning' : 'is-error'}>预览 {candidate.validation.preview ? '通过' : candidate.validation.uic ? '待配置' : '失败'}</span></div><div className="v3-create-actions"><button onClick={() => void reject()} disabled={busy}>放弃草稿</button><button className="v3-create-primary" onClick={() => void commit()} disabled={busy || !candidate.validation.uic}>审批并保存</button></div></div>}
  </section>;
}
