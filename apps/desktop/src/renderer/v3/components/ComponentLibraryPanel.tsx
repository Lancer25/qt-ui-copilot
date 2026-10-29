import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentSourceRecord, ComponentSourceSearchResult, UiCapabilityCandidate } from '@qt-ui-copilot/contracts';
import type { DesktopApi, V3PreviewResult, WorkspaceSummary } from '../../lib/api';
import { CapabilityCandidates } from './CapabilityCandidates';
import { ComponentPreviewSurface } from './ComponentPreviewSurface';
import { friendlyComponentError, type FriendlyComponentError } from './component-error';

type LibraryCandidate = UiCapabilityCandidate | ComponentSourceSearchResult;
type PreviewableCandidate = LibraryCandidate & { sourceId: string; componentId: string; previewAvailable?: boolean };

function canPreviewCandidate(candidate: LibraryCandidate): candidate is PreviewableCandidate {
  return 'sourceId' in candidate
    && typeof candidate.sourceId === 'string'
    && candidate.sourceId.length > 0
    && 'componentId' in candidate
    && typeof candidate.componentId === 'string'
    && candidate.componentId.length > 0
    && (!('previewAvailable' in candidate) || candidate.previewAvailable !== false);
}

export function ComponentLibraryPanel({ api, workspace, selected, onToggle, onClear, onOpenSettings }: { api: DesktopApi; workspace?: WorkspaceSummary; selected: UiCapabilityCandidate[]; onToggle(candidate: UiCapabilityCandidate): void; onClear(): void; onOpenSettings?: () => void }) {
  const [query, setQuery] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sources, setSources] = useState<ComponentSourceRecord[]>([]);
  const [candidates, setCandidates] = useState<LibraryCandidate[]>([]);
  const [focused, setFocused] = useState<LibraryCandidate>();
  const [previewResults, setPreviewResults] = useState<Record<string, V3PreviewResult>>({});
  const [previewing, setPreviewing] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [previewError, setPreviewError] = useState<FriendlyComponentError>();
  const previewRequestSequence = useRef(0);
  const activePreviewCapabilityId = useRef<string | undefined>(undefined);
  const qtProfile = workspace?.profile?.qt as { id?: unknown; version?: unknown } | undefined;
  const previewEnvironmentKey = JSON.stringify({ workspaceId: workspace?.id ?? 'default', sourceId, qt: qtProfile ?? null, preview: workspace?.profile?.preview ?? null });
  const previousPreviewEnvironment = useRef(previewEnvironmentKey);
  const previewCacheKey = useCallback((candidate: UiCapabilityCandidate) => `${previewEnvironmentKey}::${candidate.capabilityId}`, [previewEnvironmentKey]);

  useEffect(() => {
    void api.componentSources?.list().then(setSources).catch(() => setSources([]));
  }, [api.componentSources]);

  useEffect(() => {
    let live = true;
    const qt = workspace?.profile?.qt as { id?: unknown; version?: unknown } | undefined;
    const base = { workspaceId: workspace?.id ?? 'default', text: query, limit: 100, kind: 'ui_fragment' as const, kit: { id: typeof qt?.id === 'string' ? qt.id : undefined, version: typeof qt?.version === 'string' ? qt.version : '5.9.6', modules: ['Widgets'] } };
    const request = api.componentSources?.search ? api.componentSources.search({ ...base, ...(sourceId ? { sourceId } : {}) }) : api.capabilities?.search(base);
    if (!request) return;
    void request.then((items) => {
      if (!live) return;
      setSearchError(undefined);
      setCandidates(items);
      setFocused((current) => {
        if (!current || items.some((item) => item.capabilityId === current.capabilityId)) return current;
        previewRequestSequence.current += 1;
        activePreviewCapabilityId.current = undefined;
        setPreviewing(false);
        setPreviewError(undefined);
        return undefined;
      });
    }).catch((reason) => { if (live) setSearchError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, [api.capabilities, api.componentSources, query, sourceId, workspace?.id, workspace?.profile]);

  const renderPreview = useCallback(async (candidate: LibraryCandidate) => {
    if (!canPreviewCandidate(candidate)) { setPreviewError(friendlyComponentError('该组件未提供可预览内容。')); return; }
    if (!api.componentSources?.preview) { setPreviewError(friendlyComponentError('当前运行时未接入组件预览服务。')); return; }
    if (activePreviewCapabilityId.current === candidate.capabilityId) return;
    const requestSequence = ++previewRequestSequence.current;
    activePreviewCapabilityId.current = candidate.capabilityId;
    setPreviewing(true); setPreviewError(undefined);
    try {
      const result = await api.componentSources.preview({ sourceId: candidate.sourceId, componentId: candidate.componentId, ...(workspace ? { workspaceId: workspace.id } : {}) });
      if (requestSequence !== previewRequestSequence.current) return;
      setPreviewResults((current) => ({ ...current, [previewCacheKey(candidate)]: result }));
    }
    catch (reason) {
      if (requestSequence === previewRequestSequence.current) setPreviewError(friendlyComponentError(reason));
    }
    finally {
      if (requestSequence === previewRequestSequence.current) {
        activePreviewCapabilityId.current = undefined;
        setPreviewing(false);
      }
    }
  }, [api.componentSources, previewCacheKey, workspace?.id]);

  useEffect(() => {
    const retryForNewQtKit = () => {
      previewRequestSequence.current += 1;
      activePreviewCapabilityId.current = undefined;
      setPreviewError(undefined);
      setPreviewResults({});
      if (focused && canPreviewCandidate(focused)) void renderPreview(focused);
    };
    window.addEventListener('v3:qt-kit-selected', retryForNewQtKit);
    return () => window.removeEventListener('v3:qt-kit-selected', retryForNewQtKit);
  }, [focused, renderPreview]);

  useEffect(() => {
    if (previousPreviewEnvironment.current === previewEnvironmentKey) return;
    previousPreviewEnvironment.current = previewEnvironmentKey;
    previewRequestSequence.current += 1;
    activePreviewCapabilityId.current = undefined;
    setPreviewResults({});
    setPreviewing(false);
    setPreviewError(undefined);
    if (focused && canPreviewCandidate(focused)) void renderPreview(focused);
  }, [focused, previewEnvironmentKey, renderPreview]);

  const selectCandidate = (candidate: LibraryCandidate) => {
    if (focused?.capabilityId === candidate.capabilityId && activePreviewCapabilityId.current === candidate.capabilityId) return;
    previewRequestSequence.current += 1;
    activePreviewCapabilityId.current = undefined;
    setFocused(candidate);
    setPreviewing(false);
    setPreviewError(undefined);
    if (canPreviewCandidate(candidate) && !previewResults[previewCacheKey(candidate)]) void renderPreview(candidate);
  };

  const renderDetails = (candidate: UiCapabilityCandidate) => {
    const selectedCandidate = selected.some((item) => item.capabilityId === candidate.capabilityId);
    const canPreview = canPreviewCandidate(candidate);
    const preview = previewResults[previewCacheKey(candidate)];
    const needsBinaryMapping = candidate.kind === 'promoted_widget' && candidate.tags.includes('qt_binary') && candidate.dependencyStatus === 'blocked';
    return <aside className="v3-component-detail" aria-label={`${candidate.displayName} 组件详情`}>
      <p className="v3-component-detail__description">{candidate.description}</p>
      {'sourceName' in candidate && 'licenseName' in candidate ? <small className="v3-component-detail__meta">{String(candidate.sourceName)} · {String(candidate.licenseName)}{'inferred' in candidate && candidate.inferred ? ' · 自动发现' : ''}</small> : null}
      {needsBinaryMapping ? <p className="v3-component-detail__mapping-warning" role="status">需配置映射：{candidate.reasons[0] ?? '请在设置中补齐头文件、DLL/LIB 和 ABI 信息后再加入任务。'}</p> : null}
      <ComponentPreviewSurface title={candidate.displayName} canPreview={canPreview} rendering={previewing && activePreviewCapabilityId.current === candidate.capabilityId} imageDataUrl={preview?.imageDataUrl} error={previewError?.detail} errorTitle={previewError?.title} errorActionLabel={previewError?.action === 'settings' ? '打开设置' : undefined} onErrorAction={previewError?.action === 'settings' ? onOpenSettings : undefined} onGenerate={() => void renderPreview(candidate)} onOpen={() => { if (preview?.imageDataUrl) void api.preview?.openWindow?.(preview.imageDataUrl, candidate.displayName); }} />
      <button type="button" className="v3-component-detail__task-action" title={candidate.dependencyStatus === 'blocked' ? candidate.reasons[0] : undefined} disabled={candidate.dependencyStatus === 'blocked'} onClick={() => onToggle(candidate)}>{selectedCandidate ? '移出当前任务' : needsBinaryMapping ? '需配置映射后才能加入' : '加入当前任务'}</button>
    </aside>;
  };
  return <section className="v3-component-library" aria-label="组件库">
    <div className="v3-component-library__controls"><header><div><b>组件库</b><small>已显示 {candidates.length} 个控件；选择组件查看详情并加入下一次新界面生成</small></div>{selected.length ? <button type="button" onClick={onClear}>清空 {selected.length}</button> : null}</header>
    {sources.length ? <select aria-label="组件来源" value={sourceId} onChange={(event) => { previewRequestSequence.current += 1; activePreviewCapabilityId.current = undefined; setFocused(undefined); setPreviewing(false); setPreviewError(undefined); setSourceId(event.target.value); }}><option value="">全部来源</option>{sources.filter((source) => source.enabled).map((source) => <option key={source.id} value={source.id}>{source.name} · {source.itemCount}</option>)}</select> : null}
    <input aria-label="搜索组件" placeholder="搜索登录、表格、设置…" value={query} onChange={(event) => setQuery(event.target.value)} />
    {searchError ? <p role="alert">{searchError}</p> : null}</div>
    <CapabilityCandidates candidates={candidates} selectedIds={selected.map((item) => item.capabilityId)} focusedId={focused?.capabilityId} onSelect={selectCandidate} renderDetails={renderDetails} />
  </section>;
}
