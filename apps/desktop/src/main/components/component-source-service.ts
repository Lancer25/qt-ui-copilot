import { createHash, randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ComponentRecordSchema, ComponentSourceInputSchema, ComponentSourceSearchResultSchema, type ComponentRecord, type ComponentSourceInput, type ComponentSourceItem, type ComponentSourceRecord, type ComponentSourceSearchResult, type QtBinaryComponentMapping, type QtBinaryDiscoveryItem } from '@qt-ui-copilot/contracts';
import { LocalComponentSourceAdapter, QtBinarySourceAdapter, isQtVersionCompatible } from '@qt-ui-copilot/component-library';
import { buildUiFingerprint, parseUi } from '@qt-ui-copilot/ui-document';
import type { V3Repository } from '@qt-ui-copilot/task-store';
import { McpComponentSourceAdapter } from './mcp-component-source-adapter';

const MAX_COMPONENT_SOURCE_ITEMS = 2_048;

export interface ComponentSourceSecureStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ProtectedComponentSourceDefinition {
  id: string;
  name: string;
  rootDir: string;
  licenseName?: string;
}

export interface ComponentSourceServiceOptions {
  repository: V3Repository;
  bundledRoot: string;
  protectedSources?: readonly ProtectedComponentSourceDefinition[];
  secureStorage?: ComponentSourceSecureStorage;
  localAdapter?: Pick<LocalComponentSourceAdapter, 'discover'>;
  qtBinaryAdapter?: Pick<QtBinarySourceAdapter, 'discover'>;
  resolveQtKit?: (id: string) => ComponentSourceQtKit | undefined;
  mcpAdapter?: Pick<McpComponentSourceAdapter, 'test' | 'discover'>;
}

export interface ComponentSourceQtKit {
  id?: string;
  version: string;
  qtMajor?: number;
  compilerAbi?: string;
  architecture?: string;
}

export interface SourceComponentPreviewBuild {
  className: string;
  baseClass: 'QWidget' | 'QDialog' | 'QMainWindow';
  header: string;
  headerInclude: string;
  dependencyHeaders: Array<{ absolute: string; relative: string }>;
  sources: string[];
  includeDirs: string[];
  qssPath?: string;
  qrcPath?: string;
}

const sourceCapabilityId = (sourceId: string, componentId: string): string => {
  const hash = createHash('sha256').update(componentId).digest('hex').slice(0, 12);
  const label = componentId.replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 60) || 'component';
  return `source.${sourceId}.${hash}.${label}`;
};

function uniqueComponentItems(items: ComponentSourceItem[]): { items: ComponentSourceItem[]; merged: number } {
  const unique = new Map<string, ComponentSourceItem>();
  for (const item of items) {
    const existing = unique.get(item.componentId);
    if (!existing || (item.sourcePath ?? '').localeCompare(existing.sourcePath ?? '') < 0) unique.set(item.componentId, item);
  }
  return { items: [...unique.values()], merged: items.length - unique.size };
}

function automaticBinaryMapping(discovery: QtBinaryDiscoveryItem, kit: ComponentSourceQtKit | undefined): QtBinaryComponentMapping {
  const sourcePaths = discovery.sourcePaths ?? [];
  const binaryCertain = ['same_stem', 'single_library'].includes(discovery.dllAssociation ?? '') || ['same_stem', 'single_library'].includes(discovery.libAssociation ?? '');
  const hasBinary = Boolean(discovery.dllPath || discovery.libPath);
  const hasKit = Boolean(kit?.qtMajor && kit.compilerAbi && kit.architecture);
  const visual = Boolean(discovery.inferredQtBaseClass);
  const integration = discovery.integration ?? (sourcePaths.length ? 'source' : hasBinary ? 'binary' : 'header_only');
  const sourceReady = visual && integration !== 'binary';
  const binaryReady = visual && hasBinary && binaryCertain && hasKit;
  const confidence = sourceReady || binaryReady ? 'high' : (visual || discovery.hasQObject) ? 'medium' : 'low';
  const includeDir = path.posix.dirname(discovery.headerPath);
  return {
    componentId: discovery.componentId, className: discovery.className, baseClass: discovery.inferredQtBaseClass ?? 'QWidget', headerPath: discovery.headerPath, integration, sourcePaths,
    ...(includeDir !== '.' ? { includeDir } : {}),
    ...(discovery.dllPath ? { dllPath: discovery.dllPath, ...(discovery.dllAssociation ? { dllAssociation: discovery.dllAssociation } : {}) } : {}),
    ...(discovery.libPath ? { libPath: discovery.libPath, ...(discovery.libAssociation ? { libAssociation: discovery.libAssociation } : {}) } : {}),
    ...(discovery.qssPath ? { qssPath: discovery.qssPath } : {}), ...(discovery.qrcPath ? { qrcPath: discovery.qrcPath } : {}),
    qtModules: ['Widgets'], ...(kit?.qtMajor ? { qtMajor: kit.qtMajor } : {}), ...(kit?.compilerAbi ? { compilerAbi: kit.compilerAbi } : {}), ...(kit?.architecture ? { architecture: kit.architecture } : {}),
    runtimeDllPaths: [], designerPlugin: false, previewProperties: {}, origin: 'automatic', confidence,
    inference: [`头文件：${discovery.headerPath}`, discovery.inferredQtBaseClass ? `继承图：${discovery.inferredQtBaseClass}` : '继承图未能追溯到 Qt 基类', integration === 'source' ? `源码：${sourcePaths.join('、')}` : integration === 'header_only' ? 'Header-only 控件，无需 DLL/LIB' : hasBinary ? `二进制关联：${discovery.dllAssociation ?? discovery.libAssociation ?? '已发现'}` : '未发现 DLL/LIB', integration === 'binary' ? hasKit ? `Qt Kit：${kit!.version} / ${kit!.compilerAbi} / ${kit!.architecture}` : '未绑定完整 Qt Kit' : '使用当前项目 Qt Kit 编译'],
    approved: confidence === 'high',
  };
}

function mergeAutomaticMappings(config: import('@qt-ui-copilot/contracts').QtBinarySourceConfig, discoveries: QtBinaryDiscoveryItem[], kit: ComponentSourceQtKit | undefined): QtBinaryComponentMapping[] {
  const mappings = new Map((config.mappings ?? []).map((mapping) => [mapping.componentId, mapping]));
  for (const discovery of discoveries) {
    const current = mappings.get(discovery.componentId);
    if (current && current.origin !== 'automatic') continue;
    mappings.set(discovery.componentId, automaticBinaryMapping(discovery, kit));
  }
  return [...mappings.values()];
}

function componentRecord(item: ComponentSourceItem, binaryBuild?: ComponentRecord['binaryBuild']): ComponentRecord {
  const document = parseUi(item.uiSource, item.sourcePath ?? `${item.componentId}.ui`);
  const fingerprint = buildUiFingerprint(document);
  const objectNames = new Set([...fingerprint.widgetNames, ...fingerprint.layoutNames]);
  return ComponentRecordSchema.parse({
    id: item.componentId, name: item.name, description: item.description, tags: item.tags,
    sourceProject: item.sourceId, sourceUiFile: item.sourcePath ?? `${item.sourceId}/${item.componentId}.ui`,
    rootObjectName: document.rootWidget.objectName, uiFragment: `<item>\n${document.rootWidget.element.source}\n</item>`, screenshotPaths: [],
    structureSummary: `${fingerprint.widgetClasses.join(', ')} / ${fingerprint.layoutClasses.join(', ')}`,
    widgetClasses: fingerprint.widgetClasses, layoutTypes: fingerprint.layoutClasses,
    qssDependencies: item.assets.filter((asset) => asset.kind === 'qss').map((asset) => asset.path),
    qrcDependencies: item.assets.filter((asset) => asset.kind === 'qrc').map((asset) => asset.path),
    customWidgets: document.index.customWidgets,
    connections: document.index.connections.filter((connection) => objectNames.has(connection.sender) && objectNames.has(connection.receiver)),
    ...(item.qtVersionRange ? { qtVersionRange: item.qtVersionRange } : {}),
    usageNotes: `来源：${item.sourceId}；许可证：${item.license.name}`,
    ...(binaryBuild ? { binaryBuild } : {}),
  });
}

export class ComponentSourceService {
  private readonly local: Pick<LocalComponentSourceAdapter, 'discover'>;
  private readonly qtBinary: Pick<QtBinarySourceAdapter, 'discover'>;
  private readonly mcp: Pick<McpComponentSourceAdapter, 'test' | 'discover'>;
  private bootstrapPromise?: Promise<void>;

  constructor(private readonly options: ComponentSourceServiceOptions) {
    this.local = options.localAdapter ?? new LocalComponentSourceAdapter();
    this.qtBinary = options.qtBinaryAdapter ?? new QtBinarySourceAdapter();
    this.mcp = options.mcpAdapter ?? new McpComponentSourceAdapter();
  }

  async ensureBundledSource(): Promise<void> {
    return this.bootstrapPromise ??= (async () => {
      const definitions = this.options.protectedSources?.length ? this.options.protectedSources : [{ id: 'bundled', name: '内置组件库', rootDir: this.options.bundledRoot, licenseName: 'Qt UI Copilot Bundled Components' }];
      const failures: unknown[] = [];
      let succeeded = 0;
      for (const definition of definitions) {
        const now = Date.now();
        const existing = this.options.repository.getComponentSource(definition.id);
        this.options.repository.saveComponentSource({ id: definition.id, name: definition.name, kind: 'bundled', enabled: true, protected: true, config: {}, health: { status: 'syncing', checkedAt: now }, ...(existing?.lastSyncAt ? { lastSyncAt: existing.lastSyncAt } : {}), createdAt: existing?.createdAt ?? now, updatedAt: now });
        try {
          const items = await this.local.discover({ sourceId: definition.id, rootDir: definition.rootDir, discovery: 'manifest', limit: 256 });
          const normalized = items.map((item) => ({ ...item, ...(definition.licenseName ? { license: { name: definition.licenseName } } : {}), inferred: false }));
          this.options.repository.replaceComponentSourceItems(definition.id, normalized, now);
          this.updateHealth(definition.id, { status: 'ready', message: `已加载 ${normalized.length} 个组件`, checkedAt: now }, now);
          succeeded += 1;
        } catch (error) {
          failures.push(error);
          this.updateHealth(definition.id, { status: 'failed', message: error instanceof Error ? error.message : String(error), checkedAt: now });
        }
      }
      if (!succeeded && failures.length) throw failures[0];
    })();
  }

  async listSources(): Promise<ComponentSourceRecord[]> { await this.ensureBundledSource(); return this.options.repository.listComponentSources(); }

  async saveSource(raw: ComponentSourceInput): Promise<ComponentSourceRecord> {
    const input = ComponentSourceInputSchema.parse(raw);
    if (input.kind === 'qt_binary') await this.validateBinarySource(input.config);
    const now = Date.now();
    const id = input.id ?? `source-${randomUUID()}`;
    const existing = this.options.repository.getComponentSource(id);
    let encryptedCredential: Buffer | undefined;
    if (input.credential) {
      if (!this.options.secureStorage?.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存 MCP 凭据');
      encryptedCredential = this.options.secureStorage.encryptString(input.credential);
    }
    return this.options.repository.saveComponentSource({ id, name: input.name, kind: input.kind, enabled: input.enabled, protected: false, config: input.config, health: { status: input.enabled ? 'idle' : 'disabled' }, ...(existing?.lastSyncAt ? { lastSyncAt: existing.lastSyncAt } : {}), createdAt: existing?.createdAt ?? now, updatedAt: now, ...(encryptedCredential ? { encryptedCredential } : {}) });
  }

  async removeSource(sourceId: string): Promise<void> { await this.ensureBundledSource(); this.options.repository.deleteComponentSource(sourceId); }

  async testSource(sourceId: string): Promise<ComponentSourceRecord> {
    await this.ensureBundledSource();
    const source = this.requireSource(sourceId); const now = Date.now();
    try {
      let message: string;
      if (source.kind === 'local') {
        const config = source.config as { rootDir: string; discovery: 'manifest' | 'scan' | 'hybrid' };
        const items = await this.local.discover({ sourceId, ...config, limit: 2_048 });
        message = `连接正常，可发现 ${items.length} 个组件`;
      } else if (source.kind === 'qt_binary') {
        const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
        const items = await this.qtBinary.discover({ sourceId, rootDir: config.rootDir, discovery: config.discovery, limit: MAX_COMPONENT_SOURCE_ITEMS });
        message = `扫描正常，发现 ${items.length} 个候选组件；请完成映射和 ABI 校验后使用`;
      } else if (source.kind === 'mcp_stdio' || source.kind === 'mcp_http') {
        const result = await this.mcp.test(source, this.credential(source));
        message = `连接正常，已验证 ${result.tools.length} 个 MCP 工具`;
      } else message = '内置组件源可用';
      return this.updateHealth(sourceId, { status: 'ready', message, checkedAt: now });
    } catch (error) {
      this.updateHealth(sourceId, { status: 'failed', message: error instanceof Error ? error.message : String(error), checkedAt: now });
      throw error;
    }
  }

  async syncSource(sourceId: string, query?: string): Promise<ComponentSourceRecord> {
    await this.ensureBundledSource();
    let source = this.requireSource(sourceId); const now = Date.now();
    if (source.protected) { this.bootstrapPromise = undefined; await this.ensureBundledSource(); return this.requireSource(sourceId); }
    if (!source.enabled) throw new Error('组件源已禁用');
    this.updateHealth(sourceId, { status: 'syncing', message: '正在同步组件索引', checkedAt: now });
    try {
      let items: ComponentSourceItem[];
      let binaryControlCapReached = false;
      let autoDetectedNativeControls = false;
      let prefetchedBinaryDiscoveries: QtBinaryDiscoveryItem[] | undefined;
      if (source.kind === 'local') {
        const config = source.config as { rootDir: string; discovery: 'manifest' | 'scan' | 'hybrid' };
        try {
          prefetchedBinaryDiscoveries = await this.qtBinary.discover({ sourceId, rootDir: config.rootDir, discovery: 'scan', limit: MAX_COMPONENT_SOURCE_ITEMS });
        } catch {
          prefetchedBinaryDiscoveries = [];
        }
        const confirmedVisualControls = prefetchedBinaryDiscoveries.filter((discovery) => discovery.inferredQtBaseClass);
        if (confirmedVisualControls.length > 0) {
          autoDetectedNativeControls = true;
          const binaryConfig: import('@qt-ui-copilot/contracts').QtBinarySourceConfig = { rootDir: config.rootDir, discovery: 'hybrid', mappings: [] };
          source = this.options.repository.saveComponentSource({ ...source, kind: 'qt_binary', config: binaryConfig, health: { status: 'syncing', message: `检测到 ${confirmedVisualControls.length} 个可确认的原生 Qt 控件，正在切换扫描方式`, checkedAt: now }, updatedAt: now });
        }
      }
      if (source.kind === 'local') {
        const config = source.config as { rootDir: string; discovery: 'manifest' | 'scan' | 'hybrid' };
        items = await this.local.discover({ sourceId, ...config, limit: 256 });
      } else if (source.kind === 'qt_binary') {
        const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
        const discoveries = prefetchedBinaryDiscoveries ?? await this.qtBinary.discover({ sourceId, rootDir: config.rootDir, discovery: config.discovery, limit: MAX_COMPONENT_SOURCE_ITEMS });
        binaryControlCapReached = discoveries.length === MAX_COMPONENT_SOURCE_ITEMS;
        const libraryQtKitId = config.libraryQtKitId ?? config.qtKitId;
        const kit = libraryQtKitId ? this.options.resolveQtKit?.(libraryQtKitId) : undefined;
        const mappings = mergeAutomaticMappings(config, discoveries, kit);
        if (JSON.stringify(mappings) !== JSON.stringify(config.mappings ?? [])) {
          this.options.repository.saveComponentSource({ ...source, config: { ...config, mappings }, updatedAt: now });
        }
        items = discoveries.map((discovery) => binaryDiscoveryItem(sourceId, discovery));
      } else if (source.kind === 'mcp_stdio' || source.kind === 'mcp_http') items = await this.mcp.discover(source, this.credential(source), query);
      else items = this.options.repository.listComponentSourceItems(sourceId);
      const deduplicated = uniqueComponentItems(items);
      this.options.repository.replaceComponentSourceItems(sourceId, deduplicated.items, now);
      const duplicateSuffix = deduplicated.merged ? `；已合并 ${deduplicated.merged} 个重复声明` : '';
      const capSuffix = binaryControlCapReached ? `；已达到 ${MAX_COMPONENT_SOURCE_ITEMS} 个控件的安全索引上限，请缩小目录或提供组件清单以继续细分` : '';
      const detectionPrefix = autoDetectedNativeControls ? '已自动识别为 Qt 原生控件库；' : '';
      return this.updateHealth(sourceId, { status: deduplicated.merged || binaryControlCapReached ? 'warning' : 'ready', message: `${detectionPrefix}同步完成，共 ${deduplicated.items.length} 个组件${duplicateSuffix}${capSuffix}`, checkedAt: now }, now);
    } catch (error) {
      this.updateHealth(sourceId, { status: 'failed', message: error instanceof Error ? error.message : String(error), checkedAt: now });
      throw error;
    }
  }

  async search(input: { text?: string; sourceId?: string; qtVersion?: string; kit?: ComponentSourceQtKit; limit?: number; offset?: number }): Promise<ComponentSourceSearchResult[]> {
    await this.ensureBundledSource();
    const sources = this.options.repository.listComponentSources().filter((source) => source.enabled && (!input.sourceId || source.id === input.sourceId));
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    const text = input.text?.trim().toLocaleLowerCase() ?? '';
    const results = this.options.repository.listComponentSourceItems().filter((item) => sourceMap.has(item.sourceId)).map((item) => {
      const source = sourceMap.get(item.sourceId)!;
      const searchable = [item.name, item.description, ...item.tags].join(' ').toLocaleLowerCase();
      if (text && !text.split(/\s+/).some((term) => searchable.includes(term))) return undefined;
      const compatible = isQtVersionCompatible(input.qtVersion ?? input.kit?.version, item.qtVersionRange);
      const binaryGate = source.kind === 'qt_binary' ? binaryCompatibility(source, item.componentId, input.kit ?? { version: input.qtVersion ?? '5.9.6' }) : undefined;
      const ready = compatible && (!binaryGate || binaryGate.ready);
      return ComponentSourceSearchResultSchema.parse({
        capabilityId: sourceCapabilityId(item.sourceId, item.componentId), sourceId: item.sourceId, componentId: item.componentId,
        sourceName: source.name, displayName: item.name, kind: source.kind === 'qt_binary' ? 'promoted_widget' : 'ui_fragment', description: item.description, tags: item.tags,
        dependencyStatus: ready ? 'ready' : 'blocked', reasons: [ready ? binaryGate?.reason ?? `来自 ${source.name}` : binaryGate?.reason ?? `与 Qt ${input.qtVersion ?? input.kit?.version ?? '当前环境'} 不兼容`],
        previewAvailable: ready && (source.kind !== 'qt_binary' || sourcePreviewAvailable(source, item.componentId)), licenseName: item.license.name, inferred: item.inferred, updatedAt: item.updatedAt,
      });
    }).filter((item): item is ComponentSourceSearchResult => Boolean(item));
    const offset = Math.max(0, input.offset ?? 0);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    return results.sort((left, right) => left.sourceName.localeCompare(right.sourceName) || left.displayName.localeCompare(right.displayName)).slice(offset, offset + limit);
  }

  getItem(sourceId: string, componentId: string): ComponentSourceItem | undefined { return this.options.repository.getComponentSourceItem(sourceId, componentId); }

  getPreviewBuild(sourceId: string, componentId: string): SourceComponentPreviewBuild | undefined {
    const source = this.options.repository.getComponentSource(sourceId);
    if (!source || source.kind !== 'qt_binary') return undefined;
    const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
    const mapping = config.mappings?.find((candidate) => candidate.componentId === componentId);
    if (!mapping || !mapping.approved) return undefined;
    const sourcePaths = mapping.sourcePaths ?? [];
    const integration = mapping.integration ?? (sourcePaths.length ? 'source' : mapping.libPath || mapping.dllPath ? 'binary' : 'header_only');
    if (integration === 'binary') return undefined;
    const root = path.resolve(config.rootDir);
    const safePath = (relativePath: string): string => {
      const absolute = path.resolve(root, relativePath);
      const relative = path.relative(root, absolute);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`组件预览路径必须位于组件库根目录内：${relativePath}`);
      return absolute;
    };
    const includeDir = mapping.includeDir ?? path.posix.dirname(mapping.headerPath);
    const dependencyHeaders = new Map<string, string>();
    const dependencySources = new Set(sourcePaths.map(safePath));
    const queue = [safePath(mapping.headerPath), ...dependencySources]; const visited = new Set<string>();
    while (queue.length && visited.size < 512) {
      const current = queue.shift()!; if (visited.has(current) || !existsSync(current)) continue; visited.add(current);
      const extension = path.extname(current).toLowerCase();
      if (['.h', '.hpp', '.hh', '.hxx'].includes(extension)) dependencyHeaders.set(path.relative(root, current).replaceAll('\\', '/'), current);
      let content = ''; try { content = readFileSync(current, 'utf8'); } catch { continue; }
      for (const match of content.matchAll(/^\s*#\s*include\s*"([^"]+)"/gm)) {
        const include = match[1]!.replaceAll('\\', '/');
        const candidates = [path.resolve(path.dirname(current), include), path.resolve(root, include)];
        const resolved = candidates.find((candidate) => candidate.startsWith(root + path.sep) && existsSync(candidate));
        if (!resolved || visited.has(resolved)) continue;
        queue.push(resolved);
        if (['.h', '.hpp', '.hh', '.hxx'].includes(path.extname(resolved).toLowerCase())) for (const sourceExtension of ['.cpp', '.cc', '.cxx']) {
          const companion = resolved.slice(0, -path.extname(resolved).length) + sourceExtension;
          if (existsSync(companion)) { dependencySources.add(companion); queue.push(companion); }
        }
      }
    }
    return {
      className: mapping.className,
      baseClass: mapping.baseClass,
      header: safePath(mapping.headerPath),
      headerInclude: mapping.headerPath.replaceAll('\\', '/'),
      dependencyHeaders: [...dependencyHeaders].map(([relative, absolute]) => ({ relative, absolute })),
      sources: [...dependencySources],
      includeDirs: [...new Set([includeDir === '.' ? root : safePath(includeDir), root])],
      ...(mapping.qssPath ? { qssPath: safePath(mapping.qssPath) } : {}),
      ...(mapping.qrcPath ? { qrcPath: safePath(mapping.qrcPath) } : {}),
    };
  }

  getRecordByCapabilityId(capabilityId: string): ComponentRecord | undefined {
    for (const item of this.options.repository.listComponentSourceItems()) {
      if (sourceCapabilityId(item.sourceId, item.componentId) !== capabilityId) continue;
      const source = this.options.repository.getComponentSource(item.sourceId);
      if (source?.kind !== 'qt_binary') return componentRecord(item);
      const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
      const mapping = config.mappings?.find((candidate) => candidate.componentId === item.componentId);
      if (!mapping) return componentRecord(item);
      return componentRecord(item, binaryBuildMetadata(config.rootDir, mapping));
    }
    return undefined;
  }

  getStylesheetsByCapabilityId(capabilityId: string): string[] {
    for (const item of this.options.repository.listComponentSourceItems()) if (sourceCapabilityId(item.sourceId, item.componentId) === capabilityId) return item.assets.filter((asset) => asset.kind === 'qss' && asset.text !== undefined).map((asset) => asset.text!);
    return [];
  }

  private requireSource(sourceId: string): ComponentSourceRecord {
    const source = this.options.repository.getComponentSource(sourceId);
    if (!source) throw new Error(`未知组件源：${sourceId}`);
    return source;
  }

  private credential(source: ComponentSourceRecord): string | undefined {
    const encrypted = this.options.repository.getComponentSourceCredential(source.id);
    if (!encrypted) return undefined;
    if (!this.options.secureStorage?.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取 MCP 凭据');
    return this.options.secureStorage.decryptString(encrypted);
  }

  private updateHealth(sourceId: string, health: ComponentSourceRecord['health'], lastSyncAt?: number): ComponentSourceRecord {
    const source = this.requireSource(sourceId);
    return this.options.repository.saveComponentSource({ ...source, health, ...(lastSyncAt ? { lastSyncAt } : {}), updatedAt: Date.now() });
  }

  private async validateBinarySource(config: import('@qt-ui-copilot/contracts').QtBinarySourceConfig): Promise<void> {
    const root = path.resolve(config.rootDir);
    const metadata = await lstat(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Qt 动态组件库根目录必须是有效的本地目录，且不能是符号链接');
    for (const mapping of config.mappings ?? []) {
      const paths = [mapping.headerPath, ...(mapping.sourcePaths ?? []), mapping.includeDir, mapping.dllPath, mapping.libPath, mapping.libDir, mapping.qssPath, mapping.qrcPath, ...(mapping.runtimeDllPaths ?? [])].filter((value): value is string => Boolean(value));
      for (const relativePath of paths) {
        const absolute = path.resolve(root, relativePath);
        const relative = path.relative(root, absolute);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`组件映射路径必须位于组件库根目录内：${relativePath}`);
        try {
          const target = await lstat(absolute);
          if (target.isSymbolicLink()) throw new Error(`组件映射不允许使用符号链接：${relativePath}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}

function binaryDiscoveryItem(sourceId: string, discovery: import('@qt-ui-copilot/contracts').QtBinaryDiscoveryItem): ComponentSourceItem {
  return {
    sourceId,
    componentId: discovery.componentId,
    name: discovery.className.split('::').at(-1) ?? discovery.className,
    description: `${discovery.baseClass} 动态组件；${discovery.reason ?? '需要完成映射后才能使用'}`,
    tags: ['qt_binary', discovery.baseClass, ...(discovery.hasQObject ? ['qobject'] : [])],
    // This is an inert metadata document. It is never used to load the mapped
    // DLL; task materialization has a dedicated promoted-widget path.
    uiSource: `<ui version="4.0"><class>${discovery.className}Preview</class><widget class="QWidget" name="${discovery.componentId.replace(/[^A-Za-z0-9_]/g, '_') || 'component'}"/></ui>`,
    assets: [],
    license: { name: '本地动态组件库（用户提供）' },
    sourcePath: discovery.headerPath,
    inferred: true,
    contentHash: discovery.contentHash,
    updatedAt: Date.now(),
  };
}

function binaryBuildMetadata(sourceRoot: string, mapping: QtBinaryComponentMapping): NonNullable<ComponentRecord['binaryBuild']> {
  return {
    className: mapping.className,
    baseClass: mapping.baseClass,
    headerPath: mapping.headerPath,
    sourcePaths: mapping.sourcePaths ?? [],
    ...(mapping.includeDir ? { includeDir: mapping.includeDir } : {}),
    ...(mapping.libPath ? { libPath: mapping.libPath } : {}),
    ...(mapping.libDir ? { libDir: mapping.libDir } : {}),
    ...(mapping.dllPath ? { dllPath: mapping.dllPath } : {}),
    runtimeDllPaths: mapping.runtimeDllPaths ?? [],
    ...(mapping.qssPath ? { qssPath: mapping.qssPath } : {}),
    ...(mapping.qrcPath ? { qrcPath: mapping.qrcPath } : {}),
    qtModules: mapping.qtModules,
    sourceRoot,
  };
}

function binaryCompatibility(source: ComponentSourceRecord, componentId: string, kit: ComponentSourceQtKit): { ready: boolean; reason: string } {
  const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
  const mapping = config.mappings?.find((candidate) => candidate.componentId === componentId);
  if (!mapping) return { ready: false, reason: '该动态组件尚未完成映射配置，不能加入任务' };
  if (!mapping.approved) return { ready: false, reason: '该动态组件尚未经用户确认，不能加入任务' };
  const sourcePaths = mapping.sourcePaths ?? [];
  const integration = mapping.integration ?? (sourcePaths.length ? 'source' : mapping.libPath || mapping.dllPath ? 'binary' : 'header_only');
  if (integration === 'source') return { ready: true, reason: `源码控件将使用当前项目 Qt Kit 编译（${sourcePaths.length} 个源文件）` };
  if (integration === 'header_only') return { ready: true, reason: 'Header-only 控件将直接加入当前项目构建' };
  if (!mapping.libPath && !mapping.dllPath) return { ready: false, reason: '该动态组件缺少 DLL 或 LIB 映射，不能加入任务' };
  if (mapping.qtMajor === undefined || !mapping.compilerAbi || !mapping.architecture) return { ready: false, reason: '该动态组件需补充 Qt 主版本、编译器 ABI 和架构后才能使用' };
  const major = kit.qtMajor ?? Number(kit.version.split('.')[0]);
  if (major !== mapping.qtMajor) return { ready: false, reason: `Qt 主版本不兼容：组件要求 Qt ${mapping.qtMajor}，当前 Kit 为 Qt ${major || '未知'}` };
  if (!kit.compilerAbi || kit.compilerAbi !== mapping.compilerAbi) return { ready: false, reason: `编译器 ABI 不兼容：组件要求 ${mapping.compilerAbi}，当前 Kit 为 ${kit.compilerAbi ?? '未知'}` };
  if (!kit.architecture || kit.architecture !== mapping.architecture) return { ready: false, reason: `架构不兼容：组件要求 ${mapping.architecture}，当前 Kit 为 ${kit.architecture ?? '未知'}` };
  const libraryQtKitId = config.libraryQtKitId ?? config.qtKitId;
  if (libraryQtKitId && kit.id && libraryQtKitId !== kit.id) return { ready: false, reason: '组件库 Qt Kit 与当前项目 Qt Kit 不一致' };
  return { ready: true, reason: `预编译控件已通过组件库 Qt 与项目 Qt 的兼容性校验（Qt ${major}、${kit.compilerAbi}、${kit.architecture}）` };
}

function sourcePreviewAvailable(source: ComponentSourceRecord, componentId: string): boolean {
  const config = source.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig;
  const mapping = config.mappings?.find((candidate) => candidate.componentId === componentId);
  if (!mapping?.approved) return false;
  const sourcePaths = mapping.sourcePaths ?? [];
  const integration = mapping.integration ?? (sourcePaths.length ? 'source' : mapping.libPath || mapping.dllPath ? 'binary' : 'header_only');
  return integration === 'source' || integration === 'header_only';
}
