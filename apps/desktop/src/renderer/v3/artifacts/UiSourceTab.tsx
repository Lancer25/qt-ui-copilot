import { useEffect, useState } from 'react';
import type { DesktopApi } from '../../lib/api';

export function UiSourceTab({ api, workspaceId, filePath, fallbackSource }: { api: DesktopApi; workspaceId?: string; filePath: string; fallbackSource?: string }) {
  const [source, setSource] = useState(fallbackSource); const [error, setError] = useState<string>(); const [copyStatus, setCopyStatus] = useState<string>();
  useEffect(() => { let live = true; if (!workspaceId || !api.workspace) return; void api.workspace.readText(workspaceId, filePath).then((value) => { if (live) { setSource(value); setError(undefined); } }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }); return () => { live = false; }; }, [api.workspace, workspaceId, filePath]);
  const copyAll = async () => { if (source === undefined) return; try { if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板'); await navigator.clipboard.writeText(source); setCopyStatus('已复制全部源码'); } catch (reason) { setCopyStatus(`复制失败：${reason instanceof Error ? reason.message : String(reason)}`); } };
  const lines = source?.split('\n') ?? [];
  return <section className="v3-source-tab" aria-label="源码查看器">
    <header className="v3-source-tab__toolbar"><div><span className="v3-source-tab__path" title={filePath}>{filePath}</span><em>只读</em></div><div>{copyStatus ? <span role={copyStatus.startsWith('复制失败') ? 'alert' : 'status'}>{copyStatus}</span> : null}<button type="button" aria-label="复制全部源码" title="复制全部源码" disabled={source === undefined} onClick={() => void copyAll()}>复制全部</button></div></header>
    {error ? <section className="v3-source-tab__error" role="alert"><b>无法读取源码</b><p>{error}</p></section> : source === undefined ? <div className="v3-source-tab__loading" role="status">正在读取源码…</div> : <ol className="v3-source-lines" aria-label="源码内容">{lines.map((line, index) => <li key={index}><span className="v3-source-line__number" aria-hidden="true">{index + 1}</span><code>{line || ' '}</code></li>)}</ol>}
  </section>;
}
