import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ComponentSourceItemSchema, type ComponentSourceItem } from '@qt-ui-copilot/contracts';
import { buildUiFingerprint, parseUi } from '@qt-ui-copilot/ui-document';

export interface LocalSourceDiscoveryInput {
  sourceId: string;
  rootDir: string;
  discovery: 'manifest' | 'scan' | 'hybrid';
  limit?: number;
}

const safeId = (value: string): string => value.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128) || 'component';
const normalized = (value: string): string => value.replaceAll('\\', '/');
const atomicWidgetNames: Record<string, string> = {
  QLabel: '文本标签', QPushButton: '按钮', QToolButton: '工具按钮', QLineEdit: '单行输入框', QTextEdit: '多行输入框',
  QCheckBox: '复选框', QRadioButton: '单选框', QComboBox: '下拉选择框', QSpinBox: '整数输入框', QDoubleSpinBox: '小数输入框',
  QDateEdit: '日期选择器', QProgressBar: '进度条', QSlider: '滑块', QTabWidget: '标签页', QTableWidget: '数据表格', QGroupBox: '分组框',
};

function atomicUiSource(widgetClass: string, displayName: string): string {
  const objectName = `atomic${widgetClass}`;
  const text = widgetClass === 'QLineEdit' ? '请输入内容' : widgetClass === 'QTextEdit' ? '请输入多行内容' : widgetClass === 'QProgressBar' ? '65%' : displayName;
  const textProperty = ['QPushButton', 'QToolButton', 'QLabel', 'QCheckBox', 'QRadioButton', 'QGroupBox'].includes(widgetClass) ? `<property name="text"><string>${text}</string></property>` : '';
  const placeholder = ['QLineEdit', 'QTextEdit'].includes(widgetClass) ? `<property name="placeholderText"><string>${text}</string></property>` : '';
  const progress = widgetClass === 'QProgressBar' ? '<property name="value"><number>65</number></property>' : '';
  const orientation = widgetClass === 'QSlider' ? '<property name="orientation"><enum>Qt::Horizontal</enum></property>' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>Atomic${widgetClass}</class>\n <widget class="${widgetClass}" name="${objectName}">${textProperty}${placeholder}${progress}${orientation}</widget>\n <resources/>\n <connections/>\n</ui>`;
}

async function walk(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (['.git', '.svn', 'node_modules', 'build', '.qt-ui-copilot'].includes(entry.name)) continue;
      files.push(...await walk(root, next));
    } else if (entry.isFile()) files.push(normalized(next));
  }
  return files;
}

function inside(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Component path escapes source root: ${candidate}`);
  return absolute;
}

async function textFile(filePath: string, maxBytes = 2_000_000): Promise<string> {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.size > maxBytes) throw new Error(`Component file exceeds ${maxBytes} bytes: ${filePath}`);
  return readFile(filePath, 'utf8');
}

function licenseInfo(rootFiles: string[], contents: string | undefined): ComponentSourceItem['license'] {
  const licensePath = rootFiles.find((file) => /^licen[cs]e(?:\.|$)/i.test(path.basename(file)));
  if (!contents) return { name: licensePath ? path.basename(licensePath) : '未声明' };
  if (/MIT License/i.test(contents)) return { name: 'MIT License', spdx: 'MIT' };
  if (/Apache License[\s\S]{0,80}2\.0/i.test(contents)) return { name: 'Apache License 2.0', spdx: 'Apache-2.0' };
  if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,120}2\.1/i.test(contents)) return { name: 'GNU LGPL 2.1', spdx: 'LGPL-2.1-only' };
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,120}3/i.test(contents)) return { name: 'GNU GPL 3.0', spdx: 'GPL-3.0-only' };
  return { name: licensePath ? path.basename(licensePath) : '自定义许可证' };
}

async function assetsFor(root: string, allFiles: string[], declared: string[] = []): Promise<ComponentSourceItem['assets']> {
  const candidates = declared.length ? declared : allFiles.filter((file) => /(^|\/)(styles?|resources?)(\/|$)/i.test(file) && /\.(qss|qrc)$/i.test(file));
  const unique = [...new Set(candidates)].slice(0, 32);
  return Promise.all(unique.map(async (relativePath) => {
    const extension = path.extname(relativePath).toLowerCase();
    return { path: normalized(relativePath), kind: extension === '.qss' ? 'qss' as const : 'qrc' as const, text: await textFile(inside(root, relativePath)) };
  }));
}

function describeUi(uiSource: string, filePath: string): { tags: string[]; description: string } {
  const fingerprint = buildUiFingerprint(parseUi(uiSource, filePath));
  const tags = [...new Set([...fingerprint.widgetClasses, ...fingerprint.layoutClasses])].slice(0, 64);
  return { tags, description: `${fingerprint.widgetClasses.join('、') || 'QWidget'} 组成的 Qt Designer 模块` };
}

function atomicComponents(sourceId: string, items: readonly ComponentSourceItem[], limit: number): ComponentSourceItem[] {
  const existing = new Set(items.map((item) => item.componentId));
  const atomic: ComponentSourceItem[] = [];
  for (const item of items) {
    const fingerprint = buildUiFingerprint(parseUi(item.uiSource, item.sourcePath ?? `${item.componentId}.ui`));
    for (const widgetClass of fingerprint.widgetClasses) {
      const displayName = atomicWidgetNames[widgetClass];
      if (!displayName) continue;
      const componentId = `atomic-${widgetClass.toLowerCase()}`;
      if (existing.has(componentId) || items.length + atomic.length >= limit) continue;
      const uiSource = atomicUiSource(widgetClass, displayName);
      const contentHash = createHash('sha256').update(uiSource).update(JSON.stringify(item.assets)).digest('hex');
      atomic.push(ComponentSourceItemSchema.parse({
        sourceId,
        componentId,
        name: displayName,
        description: `可独立加入任务的 ${widgetClass} 原子控件；继承 ${item.name} 的样式资源。`,
        tags: ['原子控件', widgetClass, ...item.tags.filter((tag) => tag !== widgetClass)].slice(0, 64),
        uiSource,
        assets: item.assets,
        ...(item.qtVersionRange ? { qtVersionRange: item.qtVersionRange } : {}),
        license: item.license,
        inferred: true,
        contentHash,
        updatedAt: item.updatedAt,
      }));
      existing.add(componentId);
    }
  }
  return atomic;
}

export class LocalComponentSourceAdapter {
  async discover(input: LocalSourceDiscoveryInput): Promise<ComponentSourceItem[]> {
    const root = path.resolve(input.rootDir);
    const rootStats = await lstat(root);
    if (!rootStats.isDirectory()) throw new Error(`Local component source is not a directory: ${root}`);
    const files = await walk(root);
    const manifestFiles = files.filter((file) => path.basename(file).toLowerCase() === 'component.json');
    const claimedUi = new Set<string>();
    const results: ComponentSourceItem[] = [];
    const limit = Math.min(input.limit ?? 256, 256);
    const licensePath = files.find((file) => /^licen[cs]e(?:\.|$)/i.test(path.basename(file)));
    const license = licenseInfo(files, licensePath ? await textFile(inside(root, licensePath), 256_000).catch(() => undefined) : undefined);

    if (input.discovery !== 'scan') for (const manifestFile of manifestFiles) {
      if (results.length >= limit) break;
      const manifestPath = inside(root, manifestFile);
      const raw = JSON.parse(await textFile(manifestPath, 256_000)) as Record<string, unknown>;
      const base = path.posix.dirname(normalized(manifestFile));
      const uiRelative = normalized(path.posix.normalize(path.posix.join(base, String(raw.sourceUiFile ?? ''))));
      const uiPath = inside(root, uiRelative);
      const uiSource = await textFile(uiPath);
      parseUi(uiSource, uiPath);
      claimedUi.add(uiRelative.toLowerCase());
      const declaredAssets = [...(Array.isArray(raw.qssDependencies) ? raw.qssDependencies : []), ...(Array.isArray(raw.qrcDependencies) ? raw.qrcDependencies : [])].map((value) => normalized(path.posix.normalize(path.posix.join(base, String(value)))));
      const assets = await assetsFor(root, files, declaredAssets);
      const derived = describeUi(uiSource, uiPath);
      const componentId = safeId(String(raw.id ?? path.basename(uiRelative, '.ui')));
      const contentHash = createHash('sha256').update(uiSource).update(JSON.stringify(assets)).digest('hex');
      results.push(ComponentSourceItemSchema.parse({ sourceId: input.sourceId, componentId, name: String(raw.name ?? componentId), description: String(raw.description ?? derived.description), tags: Array.isArray(raw.tags) ? raw.tags.map(String) : derived.tags, uiSource, assets, ...(typeof raw.qtVersionRange === 'string' ? { qtVersionRange: raw.qtVersionRange } : {}), license, sourcePath: uiPath, inferred: false, contentHash, updatedAt: Date.now() }));
    }

    if (input.discovery !== 'manifest') for (const uiRelative of files.filter((file) => file.toLowerCase().endsWith('.ui'))) {
      if (results.length >= limit) break;
      if (claimedUi.has(uiRelative.toLowerCase())) continue;
      const uiPath = inside(root, uiRelative);
      const uiSource = await textFile(uiPath);
      const derived = describeUi(uiSource, uiPath);
      const nearby = files.filter((file) => path.posix.dirname(file) === path.posix.dirname(uiRelative) && /\.(qss|qrc)$/i.test(file));
      const assets = await assetsFor(root, files, nearby);
      const componentId = safeId(normalized(uiRelative).replace(/\.ui$/i, '').replaceAll('/', '.'));
      const contentHash = createHash('sha256').update(uiSource).update(JSON.stringify(assets)).digest('hex');
      results.push(ComponentSourceItemSchema.parse({ sourceId: input.sourceId, componentId, name: path.basename(uiRelative, '.ui'), description: derived.description, tags: [...derived.tags, '自动发现'], uiSource, assets, qtVersionRange: '>=5.9.6 <7.0.0', license, sourcePath: uiPath, inferred: true, contentHash, updatedAt: Date.now() }));
    }
    return [...results, ...atomicComponents(input.sourceId, results, limit)];
  }
}
