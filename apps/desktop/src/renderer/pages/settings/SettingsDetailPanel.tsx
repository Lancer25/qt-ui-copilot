import { useState } from 'react';
import type { SettingsSection } from '../../app/tabs/tab-model';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';

const copy: Record<Exclude<SettingsSection, 'model' | 'qt-kits' | 'project-binding'>, { title: string; description: string; fields: Array<{ label: string; value: string; placeholder?: string }> }> = {
  'build-tools': { title: '构建工具', description: '管理 CMake 和默认构建行为。项目绑定中的显式配置优先。', fields: [{ label: 'CMake 可执行文件', value: 'cmake', placeholder: 'C:\\Program Files\\CMake\\bin\\cmake.exe' }, { label: '默认构建类型', value: 'Debug' }] },
  preview: { title: '预览与资源', description: '控制快速预览的尺寸、样式、QSS、QRC 和字体加载策略。', fields: [{ label: 'Qt Style', value: 'Fusion' }, { label: 'Locale', value: 'zh_CN' }, { label: '预览尺寸', value: '900 × 640' }] },
  navigation: { title: '启动与导航', description: '配置真实应用启动、语义路线和人工接管策略。', fields: [{ label: '导航模式', value: '语义路线优先' }, { label: '人工接管', value: '失败时允许' }] },
  'component-sources': { title: '组件来源', description: '管理本地 Qt 组件索引；外部数据源只在显式配置后参与召回。', fields: [{ label: '本地组件库', value: '已启用' }, { label: '外部 Adapter', value: '', placeholder: '可选服务地址' }] },
  appearance: { title: '外观', description: '默认采用 B1 墨黑紫主题，保证长时间开发时的层级和对比度。', fields: [{ label: '主题', value: 'B1 · 墨黑紫 · AI 原生' }, { label: '显示密度', value: '舒适' }] },
  'data-safety': { title: '数据与安全', description: '敏感凭据只在 Main 进程安全存储；任务产物和缓存分开管理。', fields: [{ label: 'API Key', value: 'Electron safeStorage（Main 进程）' }, { label: '日志脱敏', value: '已启用' }, { label: '缓存清理', value: '仅清理可再生成产物' }] },
};

export function SettingsDetailPanel({ section }: { section: Exclude<SettingsSection, 'model' | 'qt-kits' | 'project-binding'> }) {
  const detail = copy[section]; const [values, setValues] = useState(() => Object.fromEntries(detail.fields.map((field) => [field.label, field.value]))); const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem(`qt-ui-copilot:v2-setting:${section}`, JSON.stringify(values)); setSaved(true); };
  return <Card className="settings-card"><div className="settings-card__heading"><div><h2>{detail.title}</h2><p className="muted">{detail.description}</p></div><Button variant="primary" onClick={save}>保存</Button></div><div className="settings-form-grid">{detail.fields.map((field) => <Field key={field.label} label={field.label}><input value={values[field.label] ?? ''} placeholder={field.placeholder} onChange={(event) => { setSaved(false); setValues((old) => ({ ...old, [field.label]: event.target.value })); }} /></Field>)}</div>{saved && <p role="status" className="muted">配置已保存到当前用户界面偏好。</p>}</Card>;
}
