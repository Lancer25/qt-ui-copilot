import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import type { DesktopApi, ModelCapability, ModelCapabilityResult, ModelSettings } from '../../lib/api';

export function ModelSettingsPanel({ api }: { api: DesktopApi }) {
  const [settings, setSettings] = useState<ModelSettings>();
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [capabilities, setCapabilities] = useState<Partial<Record<ModelCapability, ModelCapabilityResult>>>({});
  const [details, setDetails] = useState<Partial<Record<ModelCapability, boolean>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api.settings.getModel().then(setSettings); }, [api]);
  const update = (value: Partial<ModelSettings>) => setSettings((old) => ({ baseUrl: old?.baseUrl ?? '', model: old?.model ?? '', imagePayloadMode: old?.imagePayloadMode ?? 'base64_data_url', hasApiKey: old?.hasApiKey ?? false, ...old, ...value }));
  const save = async () => { if (!settings) return; setBusy(true); try { setSettings(await api.settings.configureModel({ baseUrl: settings.baseUrl, model: settings.model, imagePayloadMode: settings.imagePayloadMode, apiKey: key || undefined })); setKey(''); setMessage('模型配置已保存'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const test = async (capability: ModelCapability) => { setBusy(true); try { const result = await api.settings.testModelCapability({ capability }); setCapabilities((old) => ({ ...old, [capability]: result })); } catch (error) { setCapabilities((old) => ({ ...old, [capability]: { capability, ok: false, model: settings?.model ?? '', message: error instanceof Error ? error.message : String(error), elapsedMs: 0 } })); } finally { setBusy(false); } };
  const labels: Array<[ModelCapability, string, string]> = [['text', '文本生成', '文本'], ['json', '结构化 JSON', 'JSON'], ['vision', '图片理解', '视觉']];
  const summary = (capability: ModelCapability, label: string, result?: ModelCapabilityResult) => {
    if (!result) return '尚未检测';
    if (result.ok) return `${capability === 'vision' ? '图片理解' : label}可用（${result.elapsedMs} ms）`;
    const detail = result.message ?? '请求失败';
    return `${label}不可用：${detail.split(/\r?\n/)[0]}`;
  };
  return <div className="settings-model" aria-label="模型服务">
    <section className="settings-card settings-connection-card" role="group" aria-label="连接配置"><div className="settings-card__heading"><div><p className="eyebrow">模型服务</p><h2>连接配置</h2><p className="muted">配置 OpenAI-compatible 服务。密钥只在 Main 进程安全保存。</p></div>{settings?.hasApiKey && <span className="ui-badge ui-badge--success">Key 已配置</span>}</div>
      <div className="settings-connection-grid"><Field label="Base URL" hint="例如 https://api.example.com/v1"><input value={settings?.baseUrl ?? ''} onChange={(event) => update({ baseUrl: event.target.value })} /></Field><Field label="模型"><input value={settings?.model ?? ''} onChange={(event) => update({ model: event.target.value })} /></Field><div className="settings-connection-grid__key"><Field label="API Key" hint="已配置时留空可保持不变"><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings?.hasApiKey ? '已配置，留空保持不变' : '输入 API Key'} /></Field></div></div>
      <div className="settings-save-bar"><span role="status">{message}</span><Button variant="primary" loading={busy} onClick={save}>保存配置</Button></div>
    </section>
    <section className="settings-card settings-image-card" role="group" aria-label="图片配置"><div className="settings-card__heading"><div><h2>图像输入</h2><p className="muted">本地拖入图片时建议使用 Base64 Data URL。</p></div></div><Field label="图片发送格式"><select value={settings?.imagePayloadMode ?? 'base64_data_url'} onChange={(event) => update({ imagePayloadMode: event.target.value as ModelSettings['imagePayloadMode'] })}><option value="base64_data_url">Base64 Data URL（推荐）</option><option value="remote_url">远程图片 URL</option></select></Field></section>
    <section className="settings-card settings-capabilities-card" role="group" aria-label="能力检测"><div className="settings-card__heading"><div><h2>能力检测</h2><p className="muted">分别检测文本、结构化输出和图片理解能力。</p></div></div><div className="capability-grid">{labels.map(([capability, label, actionLabel]) => { const result = capabilities[capability]; return <div className="capability-check" key={capability}><div><strong>{label}</strong><p className={result?.ok ? 'settings-capability--ok' : result ? 'settings-capability--error' : 'muted'}>{summary(capability, label, result)}</p>{result && !result.ok && details[capability] ? <pre className="settings-capability__detail">{result.message ?? '请求失败'}</pre> : null}</div><div className="capability-check__actions"><Button variant="secondary" disabled={busy} onClick={() => void test(capability)}>测试{actionLabel}能力</Button>{result && !result.ok ? <button type="button" className="settings-link-button" onClick={() => setDetails((current) => ({ ...current, [capability]: !current[capability] }))}>{details[capability] ? '收起详情' : '查看详情'}</button> : null}</div></div>; })}</div></section>
  </div>;
}
