import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import type { DesktopApi, QtKit, QtKitHealth, WorkspaceSummary } from '../../lib/api';

const errorText = (reason: unknown, action: string) => {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (/ZodError|invalid_union|invalid_type/i.test(raw)) return `${action} 失败：Qt Kit 信息不完整或格式不正确。`;
  const detail = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').split(/\r?\n/, 1)[0]?.trim() || '未知错误';
  return `${action} 失败：${detail.slice(0, 300)}`;
};

export function QtKitsPanel({ api, workspace, health: externalHealth, onHealthChange }: { api: DesktopApi; workspace?: WorkspaceSummary; health?: Record<string, QtKitHealth>; onHealthChange?: (id: string, result: QtKitHealth) => void }) {
  const [kits, setKits] = useState<QtKit[]>([]); const [localHealth, setLocalHealth] = useState<Record<string, QtKitHealth>>({}); const health = externalHealth ?? localHealth;
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [message, setMessage] = useState('');
  const [rootDir, setRootDir] = useState(''); const [version, setVersion] = useState(''); const [compilerAbi, setCompilerAbi] = useState(''); const [architecture, setArchitecture] = useState('x86_64');
  const refresh = async (scan = false) => { if (!api.settings.qtKits) return; setBusy(true); setError(undefined); try { setKits(await (scan ? api.settings.qtKits.scan() : api.settings.qtKits.list())); } catch (reason) { setError(errorText(reason, scan ? '扫描 Qt Kits' : '加载 Qt Kits')); } finally { setBusy(false); } };
  useEffect(() => { void refresh(); }, [api]);
  const check = async (kit: QtKit) => { if (!api.settings.qtKits) return; setError(undefined); try { const result = await api.settings.qtKits.check(kit); setLocalHealth((old) => ({ ...old, [kit.id]: result })); onHealthChange?.(kit.id, result); } catch (reason) { setError(errorText(reason, 'Qt Kit 健康检查')); } };
  const chooseRoot = async () => { const selected = await api.projects.chooseDirectory(); if (selected) setRootDir(selected); };
  const saveManual = async () => {
    if (!api.settings.qtKits || !rootDir.trim() || !version.trim()) return;
    const major = Number(version.trim().split('.')[0]);
    if (major !== 5 && major !== 6) { setError('Qt 版本必须以 5 或 6 开头，例如 5.9.6。'); return; }
    const normalized = rootDir.trim().replaceAll('\\', '/').replace(/\/+$/, ''); const abi = compilerAbi.trim() || 'manual';
    const id = `manual-qt-${version.trim()}-${abi}`.replace(/[^A-Za-z0-9._-]+/g, '-').toLowerCase(); const binDirectory = `${normalized}/bin`;
    const kit: QtKit = { id, displayName: `Qt ${version.trim()} · ${abi}`, version: version.trim(), qtMajor: major, rootDir: normalized, binDirectory, uic: `${binDirectory}/uic.exe`, rcc: `${binDirectory}/rcc.exe`, qmake: `${binDirectory}/qmake.exe`, cmakePrefixPath: normalized, ...(compilerAbi.trim() ? { compilerAbi: compilerAbi.trim() } : {}), ...(architecture.trim() ? { architecture: architecture.trim() } : {}) };
    setBusy(true); setError(undefined); try { await api.settings.qtKits.save(kit); await refresh(); setRootDir(''); setVersion(''); setCompilerAbi(''); } catch (reason) { setError(errorText(reason, '保存 Qt Kit')); } finally { setBusy(false); }
  };
  const remove = async (kit: QtKit) => { if (!api.settings.qtKits || !window.confirm(`删除 Qt Kit“${kit.displayName}”？`)) return; setBusy(true); try { await api.settings.qtKits.delete(kit.id); await refresh(); } catch (reason) { setError(errorText(reason, '删除 Qt Kit')); } finally { setBusy(false); } };
  const useKit = async (kit: QtKit) => {
    setBusy(true); setError(undefined); setMessage('');
    try {
      if (!workspace) {
        if (!api.settings.qtKits) return;
        await Promise.all(kits.map((candidate) => api.settings.qtKits!.save({ ...candidate, isDefault: candidate.id === kit.id })));
        await refresh(); window.dispatchEvent(new CustomEvent('v3:qt-kit-selected')); setMessage(`已将 ${kit.displayName} 设为应用默认 Qt Kit。`); return;
      }
      let project = (await api.projects.list()).find((item) => item.rootDir.replaceAll('\\', '/').toLowerCase() === workspace.rootDir.replaceAll('\\', '/').toLowerCase());
      if (!project) project = await api.projects.import({ rootDir: workspace.rootDir });
      await api.settings.saveProjectBinding({ projectId: project.id, qtKitId: kit.id, config: { buildDirectory: '${projectRoot}/.qt-ui-copilot/build', executable: `${'${projectRoot}'}/.qt-ui-copilot/build/Debug/${project.id}.exe`, args: [] } });
      if (api.settings.qtKits) await Promise.all(kits.map((candidate) => api.settings.qtKits!.save({ ...candidate, isDefault: candidate.id === kit.id })));
      window.dispatchEvent(new CustomEvent('v3:project-binding-saved', { detail: { workspaceId: workspace.id } }));
      window.dispatchEvent(new CustomEvent('v3:qt-kit-selected'));
      setMessage(`已将 ${kit.displayName} 保存为当前项目 Qt Kit。`);
    } catch (reason) { setError(errorText(reason, '保存项目 Qt Kit')); }
    finally { setBusy(false); }
  };
  return <Card className="settings-card" aria-label="Qt Kits">
    <div className="settings-card__heading"><div><h2>Qt Kits</h2><p className="muted">项目 Qt Kit 用于构建、运行和源码控件预览；请绑定与项目一致的 Qt 版本和编译器 ABI。</p></div><Button disabled={busy || !api.settings.qtKits} onClick={() => void refresh(true)}>扫描 Qt Kits</Button></div>
    {error ? <p className="settings-error" role="alert">{error}</p> : null}
    {message ? <p className="settings-inline-hint" role="status">{message}</p> : null}
    {kits.length === 0 ? <EmptyState icon="◇" title="尚未添加 Qt Kit" description="可扫描本机 Qt 安装，或在下方手动添加 Kit 根目录。" /> : <div className="kit-list">{kits.map((kit) => { const result = health[kit.id]; const failed = result?.tools.find((tool) => !tool.ok); const actionLabel = workspace ? '用于当前项目' : kit.isDefault ? '当前默认 Kit' : '设为默认 Qt Kit'; return <div className="kit-row" key={kit.id}><div><strong>{kit.displayName}</strong><p className="muted">Qt {kit.qtMajor} · {kit.compilerAbi ?? '未标记 ABI'} · {kit.rootDir}</p>{failed && <p className="settings-error">{failed.name} 检测失败：{failed.message ?? '工具不可用'}</p>}</div><div className="ui-cluster"><span className={`ui-badge ui-badge--${result ? (result.ok ? 'success' : 'error') : 'neutral'}`}>{result ? (result.ok ? '健康' : '异常') : '未检测'}</span><Button variant="primary" disabled={busy || (!workspace && kit.isDefault)} title={workspace ? '保存为当前项目的 Qt Kit' : '保存为应用默认 Qt Kit'} onClick={() => void useKit(kit)}>{actionLabel}</Button><Button onClick={() => void check(kit)}>健康检查</Button><Button disabled={busy} onClick={() => void remove(kit)}>删除</Button></div></div>; })}</div>}
    <section className="component-source-add" aria-label="手动添加 Qt Kit"><h3>手动添加 Qt Kit</h3><p className="muted">选择 Qt Kit 根目录，例如 `D:/Qt/5.9.6/msvc2015_64`。应用会使用其 `bin/uic.exe`、`rcc.exe`、`qmake.exe`。</p><div className="settings-form-grid"><Field label="Kit 根目录"><div className="component-source-location"><input value={rootDir} onChange={(event) => setRootDir(event.target.value)} placeholder="D:/Qt/5.9.6/msvc2015_64" /><Button onClick={() => void chooseRoot()}>选择</Button></div></Field><Field label="Qt 版本"><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="5.9.6" /></Field><Field label="编译器 ABI"><input value={compilerAbi} onChange={(event) => setCompilerAbi(event.target.value)} placeholder="msvc2015_64" /></Field><Field label="架构"><select value={architecture} onChange={(event) => setArchitecture(event.target.value)}><option value="x86_64">x86_64</option><option value="x86">x86</option><option value="arm64">arm64</option></select></Field></div><div className="settings-save-bar"><span className="muted">保存后先运行“健康检查”，再到项目绑定中选择此 Kit。</span><Button variant="primary" disabled={busy || !rootDir.trim() || !version.trim()} onClick={() => void saveManual()}>保存 Qt Kit</Button></div></section>
  </Card>;
}
