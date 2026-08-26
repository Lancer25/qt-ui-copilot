import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import type { DesktopApi, QtKit, QtKitHealth } from '../../lib/api';

export function QtKitsPanel({ api, health: externalHealth, onHealthChange }: { api: DesktopApi; health?: Record<string, QtKitHealth>; onHealthChange?: (id: string, result: QtKitHealth) => void }) {
  const [kits, setKits] = useState<QtKit[]>([]); const [localHealth, setLocalHealth] = useState<Record<string, QtKitHealth>>({}); const health = externalHealth ?? localHealth; const [busy, setBusy] = useState(false);
  const refresh = async (scan = false) => { if (!api.settings.qtKits) return; setBusy(true); try { setKits(await (scan ? api.settings.qtKits.scan() : api.settings.qtKits.list())); } finally { setBusy(false); } };
  useEffect(() => { void refresh(); }, [api]);
  const check = async (kit: QtKit) => { if (!api.settings.qtKits) return; const result = await api.settings.qtKits.check(kit); setLocalHealth((old) => ({ ...old, [kit.id]: result })); onHealthChange?.(kit.id, result); };
  return <Card className="settings-card" aria-label="Qt Kits"><div className="settings-card__heading"><div><h2>Qt Kits</h2><p className="muted">管理 Qt 5/6 工具链，检查 uic、rcc 与预览环境。</p></div><Button disabled={busy || !api.settings.qtKits} onClick={() => void refresh(true)}>扫描 Qt Kits</Button></div>{kits.length === 0 ? <EmptyState icon="◇" title="尚未添加 Qt Kit" description={api.settings.qtKits ? '扫描本机已安装的 Qt 环境，或稍后手动添加。' : '当前运行时尚未接入 Qt Kit 服务。'} /> : <div className="kit-list">{kits.map((kit) => { const result = health[kit.id]; const failed = result?.tools.find((tool) => !tool.ok); return <div className="kit-row" key={kit.id}><div><strong>{kit.displayName}</strong><p className="muted">Qt {kit.qtMajor} · {kit.rootDir}</p>{failed && <p className="settings-error">{failed.name} 检测失败：{failed.message ?? '工具不可用'}</p>}</div><div className="ui-cluster"><span className={`ui-badge ui-badge--${result ? (result.ok ? 'success' : 'error') : 'neutral'}`}>{result ? (result.ok ? '健康' : '异常') : '未检测'}</span><Button onClick={() => void check(kit)}>健康检查</Button></div></div>; })}</div>}</Card>;
}
