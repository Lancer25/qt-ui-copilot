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
  const [busy, setBusy] = useState(false);
  useEffect(() => { void api.settings.getModel().then(setSettings); }, [api]);
  const update = (value: Partial<ModelSettings>) => setSettings((old) => ({ baseUrl: old?.baseUrl ?? '', model: old?.model ?? '', imagePayloadMode: old?.imagePayloadMode ?? 'base64_data_url', hasApiKey: old?.hasApiKey ?? false, ...old, ...value }));
  const save = async () => { if (!settings) return; setBusy(true); try { setSettings(await api.settings.configureModel({ baseUrl: settings.baseUrl, model: settings.model, imagePayloadMode: settings.imagePayloadMode, apiKey: key || undefined })); setKey(''); setMessage('模型配置已保存'); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  const test = async (capability: ModelCapability) => { setBusy(true); try { const result = await api.settings.testModelCapability({ capability }); setCapabilities((old) => ({ ...old, [capability]: result })); } catch (error) { setCapabilities((old) => ({ ...old, [capability]: { capability, ok: false, model: settings?.model ?? '', message: error instanceof Error ? error.message : String(error), elapsedMs: 0 } })); } finally { setBusy(false); } };
  const labels: Array<[ModelCapability, string, string]> = [['text', '文本生成', '文本'], ['json', '结构化 JSON', 'JSON'], ['vision', '图片理解', '视觉']];
  return <Card className="settings-card" aria-label="模型服务"><div className="settings-card__heading"><div><h2>模型服务</h2><p className="muted">配置 OpenAI-compatible 服务，并分别验证实际能力。</p></div>{settings?.hasApiKey && <span className="ui-badge ui-badge--success">Key 已配置</span>}</div>
    <div className="settings-form-grid"><Field label="Base URL" hint="例如 https://api.example.com/v1"><input value={settings?.baseUrl ?? ''} onChange={(event) => update({ baseUrl: event.target.value })} /></Field><Field label="模型"><input value={settings?.model ?? ''} onChange={(event) => update({ model: event.target.value })} /></Field><Field label="图片发送格式" hint="推荐 Base64，适合本地拖入图片"><select value={settings?.imagePayloadMode ?? 'base64_data_url'} onChange={(event) => update({ imagePayloadMode: event.target.value as ModelSettings['imagePayloadMode'] })}><option value="base64_data_url">Base64 Data URL（推荐）</option><option value="remote_url">远程图片 URL</option></select></Field><Field label="API Key" hint="密钥只在 Main 进程加密保存"><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings?.hasApiKey ? '已配置，留空保持不变' : '输入 API Key'} /></Field></div>
    <div className="ui-cluster settings-actions"><Button variant="primary" loading={busy} onClick={save}>保存配置</Button>{message && <span role="status">{message}</span>}</div>
    <div className="capability-grid">{labels.map(([capability, label, actionLabel]) => { const result = capabilities[capability]; const success = capability === 'vision' ? '图片理解可用' : `${label}可用`; return <div className="capability-check" key={capability}><div><strong>{label}</strong><p className="muted">{result ? (result.ok ? `${success}（${result.elapsedMs} ms）` : `${label}不可用：${result.message ?? '请求失败'}`) : '尚未检测'}</p></div><Button variant="secondary" disabled={busy} onClick={() => void test(capability)}>测试{actionLabel}能力</Button></div>; })}</div>
  </Card>;
}
