import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UiCreationCandidate } from '@qt-ui-copilot/contracts';
import type { DesktopApi, V3PreviewRequest, V3PreviewResult } from '../../lib/api';

type PreviewDisplayMode = 'fit' | 'actual';
const previewIconPaths = { refresh: 'M20 11a8 8 0 1 0 1.5 4.6M20 11V5m0 6h-6', fit: 'M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5', actual: 'M5 5h14v14H5zM8 9h3m-3 3h3', external: 'M14 4h6v6m0-6-9 9M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5' } as const;
function PreviewIcon({ name }: { name: keyof typeof previewIconPaths }) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={previewIconPaths[name]} /></svg>; }

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
  initialResult?: V3PreviewResult;
  onPreviewResult?: (result: V3PreviewResult) => void;
}

export function UiPreviewTab({ api, filePath, candidate, buildPreviewRequest, onOpenDiff, onOpenSource, onCommit, onReject, onAdjust, initialResult, onPreviewResult }: UiPreviewTabProps) {
  const [mode, setMode] = useState<'quick' | 'enhanced'>('quick');
  const [displayMode, setDisplayMode] = useState<PreviewDisplayMode>('fit');
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>();
  const imageRef = useRef<HTMLImageElement>(null);
  const [result, setResult] = useState<V3PreviewResult | undefined>(candidate?.previewDataUrl ? { imageDataUrl: candidate.previewDataUrl, mode: 'enhanced', imagePath: '', width: candidate.blueprint.size.width, height: candidate.blueprint.size.height, findings: [], degradedFeatures: [], confidence: 1 } : initialResult);
  const [error, setError] = useState<string>();
  const [rendering, setRendering] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const canSave = Boolean(candidate?.validation.uic);
  const previewFailure = Boolean(error || (candidate && !candidate.validation.preview && !candidate.previewDataUrl));

  useEffect(() => { const restored = candidate?.previewDataUrl ? { imageDataUrl: candidate.previewDataUrl, mode: 'enhanced' as const, imagePath: '', width: candidate.blueprint.size.width, height: candidate.blueprint.size.height, findings: [], degradedFeatures: [], confidence: 1 } : initialResult; setResult(restored); if (restored) setMode(restored.mode); setError(undefined); }, [candidate?.id, candidate?.previewDataUrl, candidate?.blueprint.size.width, candidate?.blueprint.size.height, initialResult]);

  const renderPreview = useCallback(async (nextMode = mode) => {
    if (!api.preview || !buildPreviewRequest) { setError('当前项目没有可用的预览配置。你仍可保存已通过 uic 校验的基础版本。'); return; }
    setRendering(true); setError(undefined); setMode(nextMode);
    try { const next = await api.preview.render(buildPreviewRequest(nextMode)); setResult(next); onPreviewResult?.(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setRendering(false); }
  }, [api.preview, buildPreviewRequest, mode, onPreviewResult]);

  const title = useMemo(() => filePath.split(/[\\/]/).at(-1) ?? filePath, [filePath]);
  const selectDisplayMode = (next: PreviewDisplayMode) => { if (next === 'actual' && imageRef.current?.naturalWidth) setImageSize({ width: imageRef.current.naturalWidth, height: imageRef.current.naturalHeight }); setDisplayMode(next); };
  const actualSize = result?.width && result?.height ? { width: result.width, height: result.height } : imageSize;
  const submitAdjustment = async () => { const requirement = adjustment.trim(); if (!requirement || !onAdjust) return; setAdjusting(true); try { await onAdjust(requirement, result?.imageDataUrl); setAdjustment(''); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setAdjusting(false); } };
  return <section className="v3-ui-preview" aria-label="Qt 预览">
    <header className="v3-ui-preview__toolbar">
      <div className="v3-ui-preview__mode" aria-label="预览模式"><button className={mode === 'quick' ? 'is-active' : ''} onClick={() => void renderPreview('quick')} disabled={rendering}>快速预览</button><button className={mode === 'enhanced' ? 'is-active' : ''} onClick={() => void renderPreview('enhanced')} disabled={rendering}>增强预览</button></div>
      <div className="v3-ui-preview__tools"><button aria-label="刷新预览" title="重新生成预览" onClick={() => void renderPreview()} disabled={rendering}><PreviewIcon name="refresh" /><span>{rendering ? '渲染中…' : '刷新'}</span></button><div className="v3-ui-preview__sizes" role="group" aria-label="预览尺寸">{([{ id: 'fit', label: '自适应', icon: 'fit' }, { id: 'actual', label: '原始大小', icon: 'actual' }] as const).map((item) => <button key={item.id} type="button" aria-pressed={displayMode === item.id} className={displayMode === item.id ? 'is-active' : ''} disabled={!result?.imageDataUrl} onClick={() => selectDisplayMode(item.id)}><PreviewIcon name={item.icon} /><span>{item.label}</span></button>)}</div><button aria-label="在独立窗口打开" title="在独立窗口中按原始像素查看" onClick={() => { if (result?.imageDataUrl) void api.preview?.openWindow?.(result.imageDataUrl, title); }} disabled={!result?.imageDataUrl}><PreviewIcon name="external" /><span>新窗口</span></button></div>
    </header>
    <div className={`v3-ui-preview__canvas is-${displayMode}`} aria-label="Qt 预览画布">
      {result?.imageDataUrl ? <img ref={imageRef} src={result.imageDataUrl} style={actualSize && displayMode === 'actual' ? { width: `${actualSize.width}px`, height: `${actualSize.height}px` } : undefined} onLoad={(event) => { if (event.currentTarget.naturalWidth) setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} alt={`${title} ${result.mode === 'enhanced' ? '增强' : '快速'}预览`} /> : <div className="v3-ui-preview__placeholder"><b>{rendering ? '正在渲染界面…' : '尚未生成预览'}</b><span>{filePath}</span>{!rendering ? <button onClick={() => void renderPreview()}>生成预览</button> : null}</div>}
    </div>
    {onAdjust ? <form className="v3-ui-preview__adjust" onSubmit={(event) => { event.preventDefault(); void submitAdjustment(); }}><textarea aria-label="描述预览调整" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="告诉 AI 如何调整当前界面…" rows={2} disabled={adjusting} /><button type="submit" disabled={adjusting || !adjustment.trim()}>{adjusting ? '调整中…' : '调整'}</button></form> : null}
    {error ? <section className="v3-ui-preview__diagnostic" role="alert"><b>预览不可用</b><p>{error}</p><div><button onClick={() => void renderPreview()} disabled={rendering}>重试预览</button>{onOpenSource ? <button onClick={onOpenSource}>查看 XML</button> : null}</div></section> : null}
    {!error && mode === 'enhanced' && result && <p className="v3-ui-preview__hint">增强预览会加载项目 QSS、QRC、字体和插件；当前项目未配置的资源不会产生额外视觉变化。</p>}
    {candidate?.saved ? <p role="status">本轮已完成，可以继续与 AI 对话调整。</p> : null}
    {candidate && !candidate.saved ? <footer className="v3-ui-preview__approval" aria-label="草稿审批">
      <div><b>{candidate.blueprint.fileName}</b><span className={candidate.validation.uic ? 'is-ok' : 'is-error'}>{candidate.validation.uic ? 'uic 校验通过' : 'uic 校验失败'}</span>{candidate.validation.preview || result ? <span className="is-ok">预览可用</span> : <span className="is-warning">预览待配置</span>}</div>
      <div><button onClick={() => void onReject?.(candidate.id)}>放弃</button><button onClick={onOpenDiff}>查看 Diff</button><button className="v3-ui-preview__approve" disabled={!canSave} onClick={() => void onCommit?.(candidate.id)}>{previewFailure ? '保存基础版本' : '审批并保存'}</button></div>
    </footer> : null}
  </section>;
}
