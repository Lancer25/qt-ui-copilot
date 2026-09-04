import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UiCreationCandidate } from '@qt-ui-copilot/contracts';
import type { DesktopApi, V3PreviewRequest, V3PreviewResult } from '../../lib/api';

export interface UiPreviewTabProps {
  api: DesktopApi;
  filePath: string;
  candidate?: UiCreationCandidate;
  /** Shell resolves the selected Qt Kit and project profile into a request. */
  buildPreviewRequest?: (mode: 'quick' | 'enhanced') => V3PreviewRequest;
  onOpenDiff?: () => void;
  onOpenSource?: () => void;
  onCommit?: (candidateId: string) => Promise<void> | void;
  onReject?: (candidateId: string) => Promise<void> | void;
  taskId?: string;
  onAdjust?: (requirement: string, previewDataUrl?: string) => Promise<void> | void;
}

export function UiPreviewTab({ api, filePath, candidate, buildPreviewRequest, onOpenDiff, onOpenSource, onCommit, onReject, onAdjust }: UiPreviewTabProps) {
  const [mode, setMode] = useState<'quick' | 'enhanced'>('quick');
  const [scale, setScale] = useState<'fit' | '100'>('fit');
  const [result, setResult] = useState<V3PreviewResult | undefined>(candidate?.previewDataUrl ? { imageDataUrl: candidate.previewDataUrl, mode: 'enhanced', imagePath: '', findings: [], degradedFeatures: [], confidence: 1 } : undefined);
  const [error, setError] = useState<string>();
  const [rendering, setRendering] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const canSave = Boolean(candidate?.validation.uic);
  const previewFailure = Boolean(error || (candidate && !candidate.validation.preview && !candidate.previewDataUrl));

  useEffect(() => { setResult(candidate?.previewDataUrl ? { imageDataUrl: candidate.previewDataUrl, mode: 'enhanced', imagePath: '', findings: [], degradedFeatures: [], confidence: 1 } : undefined); setError(undefined); }, [candidate?.id, candidate?.previewDataUrl]);

  const renderPreview = useCallback(async (nextMode = mode) => {
    if (!api.preview || !buildPreviewRequest) { setError('当前项目没有可用的预览配置。你仍可保存已通过 uic 校验的基础版本。'); return; }
    setRendering(true); setError(undefined); setMode(nextMode);
    try { setResult(await api.preview.render(buildPreviewRequest(nextMode))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRendering(false); }
  }, [api.preview, buildPreviewRequest, mode]);

  const title = useMemo(() => filePath.split(/[\\/]/).at(-1) ?? filePath, [filePath]);
  const submitAdjustment = async () => { const requirement = adjustment.trim(); if (!requirement || !onAdjust) return; setAdjusting(true); try { await onAdjust(requirement, result?.imageDataUrl); setAdjustment(''); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setAdjusting(false); } };
  return <section className="v3-ui-preview" aria-label="Qt 预览">
    <header className="v3-ui-preview__toolbar">
      <div className="v3-ui-preview__mode" aria-label="预览模式"><button className={mode === 'quick' ? 'is-active' : ''} onClick={() => void renderPreview('quick')} disabled={rendering}>快速预览</button><button className={mode === 'enhanced' ? 'is-active' : ''} onClick={() => void renderPreview('enhanced')} disabled={rendering}>增强预览</button></div>
      <div className="v3-ui-preview__tools"><button aria-label="刷新预览" onClick={() => void renderPreview()} disabled={rendering}>{rendering ? '渲染中…' : '刷新'}</button><button className={scale === 'fit' ? 'is-active' : ''} onClick={() => setScale('fit')}>适应窗口</button><button className={scale === '100' ? 'is-active' : ''} onClick={() => { setScale('100'); if (result?.imageDataUrl) void api.preview?.openWindow?.(result.imageDataUrl, title); }} disabled={!result?.imageDataUrl}>100% · 独立窗口</button></div>
    </header>
    <div className={`v3-ui-preview__canvas is-${scale}`} aria-label="Qt 预览画布">
      {result?.imageDataUrl ? <img src={result.imageDataUrl} alt={`${title} ${result.mode === 'enhanced' ? '增强' : '快速'}预览`} /> : <div className="v3-ui-preview__placeholder"><b>{rendering ? '正在渲染界面…' : '尚未生成预览'}</b><span>{filePath}</span>{!rendering ? <button onClick={() => void renderPreview()}>生成预览</button> : null}</div>}
    </div>
    {onAdjust ? <form className="v3-ui-preview__adjust" onSubmit={(event) => { event.preventDefault(); void submitAdjustment(); }}><textarea aria-label="描述预览调整" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="告诉 AI 如何调整当前界面…" rows={2} disabled={adjusting} /><button type="submit" disabled={adjusting || !adjustment.trim()}>{adjusting ? '调整中…' : '发送给 AI'}</button></form> : null}
    {error ? <section className="v3-ui-preview__diagnostic" role="alert"><b>预览不可用</b><p>{error}</p><div><button onClick={() => void renderPreview()} disabled={rendering}>重试预览</button>{onOpenSource ? <button onClick={onOpenSource}>查看 XML</button> : null}</div></section> : null}
    {!error && mode === 'enhanced' && result && <p className="v3-ui-preview__hint">增强预览会加载项目 QSS、QRC、字体和插件；当前项目未配置的资源不会产生额外视觉变化。</p>}
    {candidate ? <footer className="v3-ui-preview__approval" aria-label="草稿审批">
      <div><b>{candidate.blueprint.fileName}</b><span className={candidate.validation.uic ? 'is-ok' : 'is-error'}>{candidate.validation.uic ? 'uic 校验通过' : 'uic 校验失败'}</span>{candidate.validation.preview || result ? <span className="is-ok">预览可用</span> : <span className="is-warning">预览待配置</span>}</div>
      <div><button onClick={() => void onReject?.(candidate.id)}>放弃</button><button onClick={onOpenDiff}>查看 Diff</button><button className="v3-ui-preview__approve" disabled={!canSave} onClick={() => void onCommit?.(candidate.id)}>{previewFailure ? '保存基础版本' : '审批并保存'}</button></div>
    </footer> : null}
  </section>;
}
