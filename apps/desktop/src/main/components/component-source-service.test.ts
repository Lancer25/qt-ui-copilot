import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openDatabase, V3Repository } from '@qt-ui-copilot/task-store';
import { describe, expect, it, vi } from 'vitest';
import { ComponentSourceService } from './component-source-service';

describe('ComponentSourceService', () => {
  const item = (sourceId: string, license: { name: string; spdx?: string }) => ({ sourceId, componentId: `${sourceId}-card`, name: `${sourceId} Card`, description: 'Card', tags: ['card'], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: sourceId === 'gtronick-qss' ? [{ path: 'styles/MaterialDark.qss', kind: 'qss' as const, text: 'QPushButton { color: white; }' }] : [], qtVersionRange: '>=5.9.6 <7.0.0', license, inferred: false, contentHash: (sourceId === 'gtronick-qss' ? 'b' : 'a').repeat(64), updatedAt: 1 });

  it('registers multiple protected sources with independent names, licenses and search filters', async () => {
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const local = { discover: vi.fn(async ({ sourceId }: { sourceId: string }) => [sourceId === 'gtronick-qss' ? item(sourceId, { name: 'MIT License', spdx: 'MIT' }) : item(sourceId, { name: 'Internal' })]) };
    const service = new ComponentSourceService({
      repository,
      bundledRoot: 'D:/bundled',
      protectedSources: [
        { id: 'bundled', name: '内置组件库', rootDir: 'D:/bundled', licenseName: 'Qt UI Copilot Bundled Components' },
        { id: 'gtronick-qss', name: 'GTRONICK/QSS 基础控件', rootDir: 'D:/gtronick' },
      ],
      localAdapter: local,
      mcpAdapter: { test: vi.fn(), discover: vi.fn() },
    });

    expect(await service.listSources()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bundled', name: '内置组件库', protected: true, itemCount: 1, health: expect.objectContaining({ status: 'ready' }) }),
      expect.objectContaining({ id: 'gtronick-qss', name: 'GTRONICK/QSS 基础控件', protected: true, itemCount: 1, health: expect.objectContaining({ status: 'ready' }) }),
    ]));
    expect(await service.search({ sourceId: 'gtronick-qss', qtVersion: '5.9.6' })).toEqual([expect.objectContaining({ sourceId: 'gtronick-qss', sourceName: 'GTRONICK/QSS 基础控件', licenseName: 'MIT License' })]);
    expect(service.getStylesheetsByCapabilityId((await service.search({ sourceId: 'gtronick-qss' }))[0]!.capabilityId)[0]).toContain('QPushButton');
    database.close();
  });

  it('keeps healthy protected sources available when another protected source fails', async () => {
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const local = { discover: vi.fn(async ({ sourceId }: { sourceId: string }) => { if (sourceId === 'gtronick-qss') throw new Error('missing external assets'); return [item(sourceId, { name: 'Internal' })]; }) };
    const service = new ComponentSourceService({ repository, bundledRoot: 'D:/bundled', protectedSources: [{ id: 'bundled', name: '内置组件库', rootDir: 'D:/bundled' }, { id: 'gtronick-qss', name: 'GTRONICK/QSS 基础控件', rootDir: 'D:/missing' }], localAdapter: local, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });

    const sources = await service.listSources();
    expect(sources.find((source) => source.id === 'bundled')?.health.status).toBe('ready');
    expect(sources.find((source) => source.id === 'gtronick-qss')?.health).toMatchObject({ status: 'failed', message: 'missing external assets' });
    expect(await service.search({ sourceId: 'bundled' })).toHaveLength(1);
    database.close();
  });

  it('bootstraps bundled items and preserves the last snapshot after a failed sync', async () => {
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const local = { discover: vi.fn(async ({ sourceId }: { sourceId: string }) => [{ sourceId, componentId: 'card', name: 'Card', description: 'Card', tags: ['card'], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], qtVersionRange: '>=5.9.6 <7.0.0', license: { name: 'MIT' }, inferred: false, contentHash: 'a'.repeat(64), updatedAt: 1 }]) };
    const service = new ComponentSourceService({ repository, bundledRoot: path.resolve('resources/component-library'), localAdapter: local, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    expect((await service.listSources())[0]).toMatchObject({ id: 'bundled', protected: true, itemCount: 1 });
    const source = await service.saveSource({ name: 'Local', kind: 'local', enabled: true, config: { rootDir: 'D:/components', discovery: 'hybrid' } });
    await service.syncSource(source.id);
    expect((await service.search({ sourceId: source.id, qtVersion: '5.9.6' }))[0]).toMatchObject({ componentId: 'card', dependencyStatus: 'ready' });
    local.discover.mockRejectedValueOnce(new Error('offline'));
    await expect(service.syncSource(source.id)).rejects.toThrow('offline');
    expect(repository.listComponentSourceItems(source.id)).toHaveLength(1);
    expect(repository.getComponentSource(source.id)?.health.status).toBe('failed');
    database.close();
  });

  it('encrypts HTTP credentials and never returns plaintext', async () => {
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const secureStorage = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`enc:${value}`), decryptString: (value: Buffer) => value.toString().slice(4) };
    const mcpTest = vi.fn(async (_source: unknown, credential?: string) => ({ tools: [String(credential)] }));
    const service = new ComponentSourceService({ repository, bundledRoot: path.resolve('resources/component-library'), secureStorage, localAdapter: { discover: vi.fn(async () => []) }, mcpAdapter: { test: mcpTest, discover: vi.fn(async () => []) } });
    const source = await service.saveSource({ name: 'Remote', kind: 'mcp_http', enabled: true, config: { url: 'https://example.com/mcp' }, credential: 'secret' });
    expect(source).toMatchObject({ hasCredential: true });
    expect(JSON.stringify(source)).not.toContain('secret');
    await service.testSource(source.id);
    expect(mcpTest).toHaveBeenCalledWith(expect.anything(), 'secret');
    database.close();
  });

  it('keeps binary discoveries pending until an approved mapping matches the selected Qt Kit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-components-'));
    await mkdir(path.join(root, 'include'), { recursive: true });
    await writeFile(path.join(root, 'include', 'FancyCard.hpp'), 'class FancyCard : public QWidget { Q_OBJECT };');
    await writeFile(path.join(root, 'FancyCard.lib'), 'not loaded');
    await writeFile(path.join(root, 'FancyCard.dll'), 'not loaded');
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const binary = { discover: vi.fn(async ({ sourceId }: { sourceId: string }) => [{ sourceId, componentId: 'fancy-card', className: 'FancyCard', baseClass: 'QWidget' as const, headerPath: 'include/FancyCard.hpp', dllPath: 'FancyCard.dll', libPath: 'FancyCard.lib', hasQObject: true, properties: [], contentHash: 'c'.repeat(64), status: 'needs_mapping' as const, reason: '需补充映射' }]) };
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: { discover: vi.fn(async () => []) }, qtBinaryAdapter: binary, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    const source = await service.saveSource({ name: 'Fancy', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan' } });
    await service.syncSource(source.id);
    const pending = await service.search({ sourceId: source.id, kit: { id: 'kit-5', version: '5.15.2', qtMajor: 5, compilerAbi: 'msvc2019_64', architecture: 'x86_64' } });
    expect(pending).toEqual([expect.objectContaining({ componentId: 'fancy-card', dependencyStatus: 'blocked', reasons: [expect.stringContaining('尚未经用户确认')] })]);

    await service.saveSource({ id: source.id, name: 'Fancy', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan', qtKitId: 'kit-5', mappings: [{ componentId: 'fancy-card', className: 'FancyCard', baseClass: 'QWidget', headerPath: 'include/FancyCard.hpp', dllPath: 'FancyCard.dll', libPath: 'FancyCard.lib', qtModules: ['Widgets'], qtMajor: 5, compilerAbi: 'msvc2019_64', architecture: 'x86_64', approved: true }] } });
    const ready = await service.search({ sourceId: source.id, kit: { id: 'kit-5', version: '5.15.2', qtMajor: 5, compilerAbi: 'msvc2019_64', architecture: 'x86_64' } });
    expect(ready).toEqual([expect.objectContaining({ componentId: 'fancy-card', kind: 'promoted_widget', dependencyStatus: 'ready' })]);
    const incompatible = await service.search({ sourceId: source.id, kit: { id: 'kit-6', version: '6.8.0', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } });
    expect(incompatible).toEqual([expect.objectContaining({ dependencyStatus: 'blocked', reasons: [expect.stringContaining('Qt 主版本不兼容')] })]);
    database.close();
  });

  it('rejects binary mapping paths that escape the imported root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-safe-'));
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: { discover: vi.fn(async () => []) }, qtBinaryAdapter: { discover: vi.fn(async () => []) }, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    await expect(service.saveSource({ name: 'Escaped', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan', mappings: [{ componentId: 'bad', className: 'Bad', baseClass: 'QWidget', headerPath: '../outside.hpp', qtModules: [], approved: false }] } })).rejects.toThrow(/relative|asset path/i);
    database.close();
  });

  it('merges duplicate synchronized binary records instead of failing the whole source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-duplicates-'));
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const discovery = { sourceId: 'binary', componentId: 'same', className: 'Same', baseClass: 'QWidget' as const, headerPath: 'Same.hpp', hasQObject: true, properties: [], contentHash: 'd'.repeat(64), status: 'needs_mapping' as const };
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: { discover: vi.fn(async () => []) }, qtBinaryAdapter: { discover: vi.fn(async () => [discovery, { ...discovery, headerPath: 'Other.hpp' }]) }, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    const source = await service.saveSource({ name: 'Duplicates', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan' } });
    const result = await service.syncSource(source.id);
    expect(result.health.status).toBe('warning');
    expect(result.health.message).toContain('已合并 1 个重复声明');
    expect(repository.listComponentSourceItems(source.id)).toHaveLength(1);
    database.close();
  });

  it('automatically confirms a high-confidence binary mapping bound to a matching Qt Kit', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-auto-'));
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const discovery = { sourceId: 'binary', componentId: 'include-fancy-hpp-fancy', className: 'Fancy', baseClass: 'QWidget', directBaseClass: 'HuiBase', inferredQtBaseClass: 'QWidget' as const, headerPath: 'include/Fancy.hpp', dllPath: 'bin/Fancy.dll', libPath: 'lib/Fancy.lib', dllAssociation: 'same_stem' as const, libAssociation: 'same_stem' as const, hasQObject: true, properties: [], contentHash: 'e'.repeat(64), status: 'needs_mapping' as const };
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: { discover: vi.fn(async () => []) }, qtBinaryAdapter: { discover: vi.fn(async () => [discovery]) }, resolveQtKit: () => ({ id: 'kit-6', version: '6.8.0', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' }), mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    const source = await service.saveSource({ name: 'Auto', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan', libraryQtKitId: 'kit-6' } });
    await service.syncSource(source.id);
    const saved = repository.getComponentSource(source.id)!;
    const mapping = (saved.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig).mappings?.[0];
    expect(mapping).toMatchObject({ origin: 'automatic', confidence: 'high', approved: true, qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' });
    const results = await service.search({ sourceId: source.id, kit: { id: 'kit-6', version: '6.8.0', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } });
    expect(results).toEqual([expect.objectContaining({ dependencyStatus: 'ready' })]);
    database.close();
  });

  it('indexes and pages more than the legacy 256 dynamic controls', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-paged-'));
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const discoveries = Array.from({ length: 300 }, (_, index) => ({ sourceId: 'binary', componentId: `button-${index + 1}`, className: `Button${index + 1}`, baseClass: 'QWidget' as const, headerPath: `include/Button${index + 1}.hpp`, hasQObject: true, properties: [], contentHash: `${index}`.padStart(64, '0'), status: 'needs_mapping' as const }));
    const binary = { discover: vi.fn(async () => discoveries) };
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: { discover: vi.fn(async () => []) }, qtBinaryAdapter: binary, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    const source = await service.saveSource({ name: 'Large controls', kind: 'qt_binary', enabled: true, config: { rootDir: root, discovery: 'scan' } });

    await service.syncSource(source.id);
    const first = await service.search({ sourceId: source.id, limit: 100 });
    const second = await service.search({ sourceId: source.id, limit: 100, offset: 100 });

    expect(repository.listComponentSourceItems(source.id)).toHaveLength(300);
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(100);
    expect(new Set([...first, ...second].map((item) => item.componentId))).toHaveLength(200);
    expect(binary.discover).toHaveBeenCalledWith(expect.objectContaining({ limit: 2_048 }));
    database.close();
  });

  it('automatically promotes a local directory to a native Qt control library during sync', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-native-auto-detect-'));
    const database = openDatabase(':memory:'); const repository = new V3Repository(database);
    const localItems = Array.from({ length: 7 }, (_, index) => ({ ...item('local', { name: 'Internal' }), componentId: `form-${index + 1}`, name: `Form ${index + 1}` }));
    const discoveries = Array.from({ length: 30 }, (_, index) => ({ sourceId: 'local', componentId: `control-${index + 1}`, className: `Control${index + 1}`, baseClass: 'QWidget' as const, inferredQtBaseClass: 'QWidget' as const, headerPath: `include/Control${index + 1}.hpp`, sourcePaths: [`src/Control${index + 1}.cpp`], hasQObject: false, properties: [], contentHash: `${index + 1}`.padStart(64, 'a').slice(-64), status: 'needs_mapping' as const }));
    const local = { discover: vi.fn(async () => localItems) };
    const binary = { discover: vi.fn(async () => discoveries) };
    const service = new ComponentSourceService({ repository, bundledRoot: root, localAdapter: local, qtBinaryAdapter: binary, mcpAdapter: { test: vi.fn(), discover: vi.fn() } });
    const source = await service.saveSource({ name: 'ExampleControls', kind: 'local', enabled: true, config: { rootDir: root, discovery: 'hybrid' } });

    const synced = await service.syncSource(source.id);

    expect(synced).toMatchObject({ id: source.id, kind: 'qt_binary', itemCount: 30, health: { status: 'ready' } });
    expect(synced.health.message).toContain('已自动识别为 Qt 原生控件库');
    expect(repository.listComponentSourceItems(source.id)).toHaveLength(30);
    expect((synced.config as import('@qt-ui-copilot/contracts').QtBinarySourceConfig).mappings?.[0]).toMatchObject({ integration: 'source', sourcePaths: ['src/Control1.cpp'], approved: true });
    expect((await service.search({ sourceId: source.id }))[0]).toMatchObject({ dependencyStatus: 'ready', previewAvailable: true, reasons: [expect.stringContaining('源码')] });
    expect(binary.discover).toHaveBeenCalledTimes(1);
    expect(local.discover).not.toHaveBeenCalledWith(expect.objectContaining({ sourceId: source.id }));
    database.close();
  });
});
