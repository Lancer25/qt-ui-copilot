import { useCallback, useEffect, useState } from 'react';
import type { ComponentSourceInput, ComponentSourceRecord, ComponentSourceSearchResult, QtBinaryComponentMapping, QtBinarySourceConfig } from '@qt-ui-copilot/contracts';
import type { DesktopApi } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';

type EditableKind = 'local' | 'qt_binary' | 'mcp_stdio' | 'mcp_http';
const BINARY_CANDIDATE_PAGE_SIZE = 25;
const statusText: Record<ComponentSourceRecord['health']['status'], string> = { idle: '待同步', syncing: '同步中', ready: '可用', warning: '有警告', failed: '失败', disabled: '已禁用' };

type BinaryMappingDraft = {
  componentId: string;
  className: string;
  baseClass: 'QWidget' | 'QDialog' | 'QMainWindow';
  headerPath: string;
  dllPath: string;
  libPath: string;
  qtMajor: string;
  compilerAbi: string;
  architecture: string;
  approved: boolean;
};

const binaryConfig = (source: ComponentSourceRecord): QtBinarySourceConfig => source.config as unknown as QtBinarySourceConfig;
const mappingIntegration = (mapping: QtBinaryComponentMapping): 'source' | 'header_only' | 'binary' => mapping.integration ?? ((mapping.sourcePaths?.length ?? 0) > 0 ? 'source' : mapping.dllPath || mapping.libPath ? 'binary' : 'header_only');
const sourceType = (source: ComponentSourceRecord): string => source.kind === 'bundled' ? '内置' : source.kind === 'local' ? '本地代码' : source.kind === 'qt_binary' ? (binaryConfig(source).mappings ?? []).some((mapping) => mappingIntegration(mapping) !== 'binary') ? 'Qt 源码控件库' : 'Qt 动态库' : source.kind === 'mcp_stdio' ? 'MCP stdio' : 'MCP HTTP';
const draftFrom = (candidate: ComponentSourceSearchResult, mapping?: QtBinaryComponentMapping): BinaryMappingDraft => ({
  componentId: candidate.componentId,
  className: mapping?.className ?? (candidate.displayName.replace(/[^A-Za-z0-9_]/g, '') || 'CustomWidget'),
  baseClass: mapping?.baseClass ?? 'QWidget',
  headerPath: mapping?.headerPath ?? '',
  dllPath: mapping?.dllPath ?? '',
  libPath: mapping?.libPath ?? '',
  qtMajor: mapping?.qtMajor?.toString() ?? '',
  compilerAbi: mapping?.compilerAbi ?? '',
  architecture: mapping?.architecture ?? '',
  approved: mapping?.approved ?? false,
});

function updateInput(source: ComponentSourceRecord, enabled: boolean): ComponentSourceInput {
  if (source.kind === 'local') return { id: source.id, name: source.name, kind: 'local', enabled, config: source.config as { rootDir: string; discovery: 'manifest' | 'scan' | 'hybrid' } };
  if (source.kind === 'qt_binary') return { id: source.id, name: source.name, kind: 'qt_binary', enabled, config: binaryConfig(source) };
  if (source.kind === 'mcp_stdio') return { id: source.id, name: source.name, kind: 'mcp_stdio', enabled, config: source.config as { command: string; args: string[]; cwd?: string } };
  if (source.kind === 'mcp_http') return { id: source.id, name: source.name, kind: 'mcp_http', enabled, config: source.config as { url: string } };
  throw new Error('内置组件源不能修改');
}

export function ComponentSourcesPanel({ api }: { api: DesktopApi }) {
  const [sources, setSources] = useState<ComponentSourceRecord[]>([]);
  const [kind, setKind] = useState<EditableKind>('local');
  const [name, setName] = useState(''); const [location, setLocation] = useState(''); const [args, setArgs] = useState(''); const [cwd, setCwd] = useState(''); const [credential, setCredential] = useState('');
  const [discovery, setDiscovery] = useState<'manifest' | 'scan' | 'hybrid'>('hybrid');
  const [libraryQtKitId, setLibraryQtKitId] = useState('');
  const [kits, setKits] = useState<Array<{ id: string; displayName: string }>>([]);
  const [binaryCandidates, setBinaryCandidates] = useState<Record<string, ComponentSourceSearchResult[]>>({});
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, BinaryMappingDraft>>({});
  const [busy, setBusy] = useState<string>(); const [message, setMessage] = useState('');
  const refresh = useCallback(async () => { setSources(await api.componentSources?.list() ?? []); }, [api.componentSources]);
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }, [refresh]);
  useEffect(() => { void api.settings?.qtKits?.list?.().then((items) => setKits(items.map((kit) => ({ id: kit.id, displayName: kit.displayName })))).catch(() => setKits([])); }, [api.settings?.qtKits]);
  const loadBinaryCandidates = useCallback(async (source: ComponentSourceRecord, offset = 0, append = false) => {
    if (source.kind !== 'qt_binary' || !api.componentSources?.search) return;
    try {
      const items = await api.componentSources.search({ workspaceId: 'component-source-settings', sourceId: source.id, kind: 'promoted_widget', limit: BINARY_CANDIDATE_PAGE_SIZE, offset, kit: { id: binaryConfig(source).libraryQtKitId ?? binaryConfig(source).qtKitId, version: '5.9.6', modules: ['Widgets'] } });
      setBinaryCandidates((current) => {
        const existing = current[source.id] ?? [];
        const next = append ? [...existing, ...items.filter((item) => !existing.some((candidate) => candidate.componentId === item.componentId))] : items;
        return { ...current, [source.id]: next };
      });
      setMappingDrafts((current) => {
        const config = binaryConfig(source);
        const next = { ...current };
        for (const item of items) {
          const key = `${source.id}:${item.componentId}`;
          if (!next[key]) next[key] = draftFrom(item, config.mappings?.find((mapping) => mapping.componentId === item.componentId));
        }
        return next;
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }, [api.componentSources]);
  useEffect(() => { for (const source of sources) if (source.kind === 'qt_binary') void loadBinaryCandidates(source); }, [loadBinaryCandidates, sources]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => { setBusy(key); try { await action(); await refresh(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(undefined); } };
  const add = async () => {
    if (!api.componentSources || !name.trim() || !location.trim()) return;
    let input: ComponentSourceInput;
    if (kind === 'local') input = { name: name.trim(), kind, enabled: true, config: { rootDir: location.trim(), discovery } };
    else if (kind === 'qt_binary') input = { name: name.trim(), kind, enabled: true, config: { rootDir: location.trim(), discovery, ...(libraryQtKitId.trim() ? { libraryQtKitId: libraryQtKitId.trim() } : {}) } };
    else if (kind === 'mcp_stdio') input = { name: name.trim(), kind, enabled: true, config: { command: location.trim(), args: args.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), ...(cwd.trim() ? { cwd: cwd.trim() } : {}) } };
    else input = { name: name.trim(), kind, enabled: true, config: { url: location.trim() }, ...(credential ? { credential } : {}) };
    await run('add', async () => { const saved = await api.componentSources!.save(input); await api.componentSources!.sync(saved.id); setName(''); setLocation(''); setArgs(''); setCwd(''); setCredential(''); setLibraryQtKitId(''); }, '组件源已添加并同步');
  };
  const chooseFolder = async () => { const selected = await api.projects.chooseDirectory(); if (selected) setLocation(selected); };
  const updateDraft = (sourceId: string, componentId: string, patch: Partial<BinaryMappingDraft>) => setMappingDrafts((current) => ({ ...current, [`${sourceId}:${componentId}`]: { ...(current[`${sourceId}:${componentId}`] ?? { componentId, className: '', baseClass: 'QWidget', headerPath: '', dllPath: '', libPath: '', qtMajor: '', compilerAbi: '', architecture: '', approved: false }), ...patch } }));
  const saveMapping = async (source: ComponentSourceRecord, candidate: ComponentSourceSearchResult) => {
    const draft = mappingDrafts[`${source.id}:${candidate.componentId}`];
    if (!draft || !draft.className.trim() || !draft.headerPath.trim()) { setMessage('请至少填写组件类名和相对头文件路径后再保存映射'); return; }
    const parsedMajor = draft.qtMajor.trim() ? Number(draft.qtMajor) : undefined;
    if (parsedMajor !== undefined && (!Number.isInteger(parsedMajor) || parsedMajor < 4 || parsedMajor > 9)) { setMessage('Qt 主版本应为 4 到 9 的整数'); return; }
    const config = binaryConfig(source);
    const existingMapping = config.mappings?.find((item) => item.componentId === draft.componentId);
    const mapping: QtBinaryComponentMapping = {
      componentId: draft.componentId, className: draft.className.trim(), baseClass: draft.baseClass, headerPath: draft.headerPath.trim(), ...(existingMapping?.integration ? { integration: existingMapping.integration } : {}), sourcePaths: existingMapping?.sourcePaths ?? [], qtModules: ['Widgets'], runtimeDllPaths: [], designerPlugin: false, previewProperties: {}, origin: 'manual', confidence: 'low', inference: [], approved: draft.approved,
      ...(draft.dllPath.trim() ? { dllPath: draft.dllPath.trim() } : {}), ...(draft.libPath.trim() ? { libPath: draft.libPath.trim() } : {}),
      ...(parsedMajor !== undefined ? { qtMajor: parsedMajor } : {}), ...(draft.compilerAbi.trim() ? { compilerAbi: draft.compilerAbi.trim() } : {}), ...(draft.architecture.trim() ? { architecture: draft.architecture.trim() } : {}),
    };
    const mappings = [...(config.mappings ?? []).filter((item) => item.componentId !== mapping.componentId), mapping];
    await run(`mapping:${source.id}:${candidate.componentId}`, async () => {
      await api.componentSources!.save({ id: source.id, name: source.name, kind: 'qt_binary', enabled: source.enabled, config: { ...config, mappings } });
      await api.componentSources!.sync(source.id);
      await loadBinaryCandidates({ ...source, config: { ...config, mappings } });
    }, `已保存 ${mapping.className} 的映射配置`);
  };

  return <Card className="settings-card component-sources-settings" aria-label="组件来源设置">
    <div className="settings-card__heading"><div><h2>组件来源</h2><p className="muted">接入本地 Qt 控件目录或只读 MCP 服务；本地目录会自动识别 .ui 模块与原生 C++ 控件。</p></div><span className="ui-badge ui-badge--neutral">{sources.reduce((sum, source) => sum + source.itemCount, 0)} 个组件</span></div>
    <section className="component-source-list" aria-label="已配置来源">{sources.map((source) => <article key={source.id} className="component-source-card">
      <div className="component-source-card__info"><b title={source.name}>{source.name}</b><small>{sourceType(source)} · {source.itemCount} 个组件</small><p>{source.health.message ?? statusText[source.health.status]}</p></div>
      <span className={`component-source-status is-${source.health.status}`}>{statusText[source.health.status]}</span>
      <div className="component-source-actions"><Button disabled={busy !== undefined} onClick={() => void run(`test:${source.id}`, () => api.componentSources!.test(source.id), '连接测试通过')}>测试</Button><Button disabled={busy !== undefined} onClick={() => void run(`sync:${source.id}`, () => api.componentSources!.sync(source.id), '同步完成')}>同步</Button>{!source.protected ? <Button disabled={busy !== undefined} onClick={() => void run(`toggle:${source.id}`, () => api.componentSources!.save(updateInput(source, !source.enabled)), source.enabled ? '来源已禁用' : '来源已启用')}>{source.enabled ? '禁用' : '启用'}</Button> : null}{!source.protected ? <Button disabled={busy !== undefined} onClick={() => { if (window.confirm(`删除组件源“${source.name}”及其缓存索引？`)) void run(`remove:${source.id}`, () => api.componentSources!.remove(source.id), '组件源已删除'); }}>删除</Button> : null}</div>
      {source.kind === 'qt_binary' ? <BinaryMappingPanel source={source} candidates={binaryCandidates[source.id] ?? []} drafts={mappingDrafts} busy={busy} onChange={updateDraft} onSave={saveMapping} onLoadMore={() => loadBinaryCandidates(source, (binaryCandidates[source.id] ?? []).length, true)} /> : null}
    </article>)}</section>
    <section className="component-source-add" aria-label="添加组件源"><h3>添加来源</h3><div className="settings-form-grid">
      <Field label="类型"><select value={kind} onChange={(event) => { setKind(event.target.value as EditableKind); setLocation(''); }}><option value="local">本地控件库（自动识别）</option><option value="qt_binary">Qt 动态组件库（手动指定）</option><option value="mcp_stdio">MCP stdio</option><option value="mcp_http">MCP Streamable HTTP</option></select></Field>
      <Field label="名称"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 企业组件库" /></Field>
      <Field label={kind === 'local' || kind === 'qt_binary' ? '根目录' : kind === 'mcp_stdio' ? '可执行命令' : 'HTTPS URL'}><div className="component-source-location"><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={kind === 'local' ? 'D:/QtComponents' : kind === 'qt_binary' ? 'D:/VendorWidgets' : kind === 'mcp_stdio' ? 'node' : 'https://example.com/mcp'} />{kind === 'local' || kind === 'qt_binary' ? <Button onClick={() => void chooseFolder()}>选择</Button> : null}</div></Field>
      {kind === 'local' || kind === 'qt_binary' ? <Field label="发现方式"><select value={discovery} onChange={(event) => setDiscovery(event.target.value as typeof discovery)}><option value="hybrid">清单优先 + 自动扫描</option><option value="manifest">仅 component.json</option><option value="scan">仅自动扫描{kind === 'qt_binary' ? '头文件与 DLL/LIB' : ' .ui 与原生控件'}</option></select></Field> : null}
      {kind === 'qt_binary' ? <Field label="组件库 Qt Kit（仅 DLL/LIB，可选）"><div><input list="component-source-qt-kits" value={libraryQtKitId} onChange={(event) => setLibraryQtKitId(event.target.value)} placeholder="选择组件库编译时使用的 Qt Kit" /><datalist id="component-source-qt-kits">{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.displayName}</option>)}</datalist><small className="muted">项目 Qt Kit 在“项目绑定”中设置；源码和 header-only 控件会直接使用项目 Qt 编译。</small></div></Field> : null}
      {kind === 'mcp_stdio' ? <><Field label="参数（每行一个）"><textarea rows={3} value={args} onChange={(event) => setArgs(event.target.value)} /></Field><Field label="工作目录（可选）"><input value={cwd} onChange={(event) => setCwd(event.target.value)} /></Field></> : null}
      {kind === 'mcp_http' ? <Field label="Bearer Token（可选，仅写入）"><input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} autoComplete="new-password" /></Field> : null}
    </div><div className="settings-save-bar"><span role="status">{message}</span><Button variant="primary" loading={busy === 'add'} disabled={!api.componentSources || !name.trim() || !location.trim()} onClick={() => void add()}>添加并同步</Button></div></section>
  </Card>;
}

function BinaryMappingPanel({ source, candidates, drafts, busy, onChange, onSave, onLoadMore }: { source: ComponentSourceRecord; candidates: ComponentSourceSearchResult[]; drafts: Record<string, BinaryMappingDraft>; busy?: string; onChange(sourceId: string, componentId: string, patch: Partial<BinaryMappingDraft>): void; onSave(source: ComponentSourceRecord, candidate: ComponentSourceSearchResult): Promise<void>; onLoadMore(): void }) {
  const mappings = binaryConfig(source).mappings ?? [];
  const readyCount = mappings.filter((mapping) => {
    if (!mapping.approved) return false;
    const integration = mappingIntegration(mapping);
    return integration !== 'binary' || (Boolean(mapping.dllPath || mapping.libPath) && mapping.qtMajor !== undefined && Boolean(mapping.compilerAbi) && Boolean(mapping.architecture));
  }).length;
  return <section className="component-source-binary" aria-label={`${source.name} 控件接入状态`}>
    <header><b>控件接入状态</b><small>已索引 {source.itemCount} 个控件，当前显示 {candidates.length} 个 · 已自动接入 {readyCount} · 需配置 {Math.max(0, source.itemCount - readyCount)}</small></header>
    {!candidates.length ? <p>同步后将在此展示从头文件自动发现的 Qt 界面控件。</p> : candidates.map((candidate) => {
      const draft = drafts[`${source.id}:${candidate.componentId}`] ?? draftFrom(candidate, mappings.find((mapping) => mapping.componentId === candidate.componentId));
      const saved = mappings.find((mapping) => mapping.componentId === candidate.componentId);
      const integration = saved ? mappingIntegration(saved) : undefined;
      const automaticallyReady = Boolean(saved?.approved && saved.origin === 'automatic' && integration !== 'binary');
      return <article key={candidate.componentId} className="component-source-mapping" data-ready={saved?.approved ? 'true' : 'false'}>
        <header><b>{candidate.displayName}</b><span>{automaticallyReady ? integration === 'source' ? '自动接入 · 源码' : '自动接入 · Header-only' : saved?.approved ? saved.origin === 'automatic' ? `自动映射 · ${saved.confidence === 'high' ? '高置信度' : saved.confidence}` : '已确认' : '需配置映射'}</span></header>
        {saved?.origin === 'automatic' && saved.inference.length ? <p className="component-source-mapping__inference">{saved.inference.join(' · ')}</p> : null}
        {automaticallyReady ? <p className="component-source-mapping__inference">无需 DLL/LIB 映射，将随当前项目一起编译。</p> : <><div className="component-source-mapping__grid">
          <Field label="类名"><input aria-label={`${candidate.displayName} 类名`} value={draft.className} onChange={(event) => onChange(source.id, candidate.componentId, { className: event.target.value })} /></Field>
          <Field label="基类"><select aria-label={`${candidate.displayName} 基类`} value={draft.baseClass} onChange={(event) => onChange(source.id, candidate.componentId, { baseClass: event.target.value as BinaryMappingDraft['baseClass'] })}><option>QWidget</option><option>QDialog</option><option>QMainWindow</option></select></Field>
          <Field label="头文件（相对路径）"><input aria-label={`${candidate.displayName} 头文件`} value={draft.headerPath} placeholder="include/MyWidget.h" onChange={(event) => onChange(source.id, candidate.componentId, { headerPath: event.target.value })} /></Field>
          <Field label="DLL（可选）"><input aria-label={`${candidate.displayName} DLL`} value={draft.dllPath} placeholder="bin/MyWidgets.dll" onChange={(event) => onChange(source.id, candidate.componentId, { dllPath: event.target.value })} /></Field>
          <Field label="LIB（可选）"><input aria-label={`${candidate.displayName} LIB`} value={draft.libPath} placeholder="lib/MyWidgets.lib" onChange={(event) => onChange(source.id, candidate.componentId, { libPath: event.target.value })} /></Field>
          <Field label="Qt 主版本"><input aria-label={`${candidate.displayName} Qt 主版本`} inputMode="numeric" value={draft.qtMajor} placeholder="例如 6" onChange={(event) => onChange(source.id, candidate.componentId, { qtMajor: event.target.value })} /></Field>
          <Field label="编译器 ABI"><input aria-label={`${candidate.displayName} 编译器 ABI`} value={draft.compilerAbi} placeholder="例如 msvc2022_64" onChange={(event) => onChange(source.id, candidate.componentId, { compilerAbi: event.target.value })} /></Field>
          <Field label="架构"><input aria-label={`${candidate.displayName} 架构`} value={draft.architecture} placeholder="例如 x86_64" onChange={(event) => onChange(source.id, candidate.componentId, { architecture: event.target.value })} /></Field>
        </div>
        <label className="component-source-mapping__approval"><input type="checkbox" checked={draft.approved} onChange={(event) => onChange(source.id, candidate.componentId, { approved: event.target.checked })} />已核对 ABI 与依赖，允许加入任务</label>
        <Button disabled={busy !== undefined || !draft.className.trim() || !draft.headerPath.trim()} onClick={() => void onSave(source, candidate)}>保存映射</Button>
        </>}
      </article>;
    })}
    {candidates.length > 0 && candidates.length < source.itemCount ? <Button disabled={busy !== undefined} onClick={onLoadMore}>加载更多控件</Button> : null}
  </section>;
}
