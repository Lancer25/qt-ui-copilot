import { useEffect, useState } from 'react';
import type { DesktopApi } from '../../lib/api';

export function UiSourceTab({ api, workspaceId, filePath, fallbackSource }: { api: DesktopApi; workspaceId?: string; filePath: string; fallbackSource?: string }) {
  const [source, setSource] = useState(fallbackSource); const [error, setError] = useState<string>();
  useEffect(() => { let live = true; if (!workspaceId || !api.workspace) return; void api.workspace.readText(workspaceId, filePath).then((value) => { if (live) { setSource(value); setError(undefined); } }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); }); return () => { live = false; }; }, [api.workspace, workspaceId, filePath]);
  return <section className="v3-source-tab" aria-label="UI XML 源码">{error ? <p role="alert">{error}</p> : null}<pre><code>{source ?? '正在读取源码…'}</code></pre></section>;
}
