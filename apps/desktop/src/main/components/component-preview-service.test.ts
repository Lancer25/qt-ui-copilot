import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LocalComponentSourceAdapter } from '@qt-ui-copilot/component-library';
import { ComponentPreviewService } from './component-preview-service';

describe('ComponentPreviewService', () => {
  it('stages cached UI/QSS assets and renders through the workspace Qt profile', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'component-preview-'));
    const render = vi.fn(async (input: { uiFile: string; profile: { stylesheets: string[] } }) => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 320, height: 200, findings: [], degradedFeatures: [], confidence: 1, input }));
    const item = { sourceId: 'source', componentId: 'card', name: 'Card', description: 'Card', tags: [], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [{ path: 'styles/card.qss', kind: 'qss' as const, text: 'QWidget{}' }], license: { name: 'MIT' }, inferred: false, contentHash: 'a'.repeat(64), updatedAt: 1 };
    const config = { qt: { version: '5.9.6', compilerAbi: 'msvc2015_64', architecture: 'x86_64', binDirectory: 'bin', uic: process.execPath, rcc: process.execPath, cmake: 'cmake', cmakePrefixPath: 'qt' }, preview: { width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', pluginPaths: [], sourceDirectory: 'preview-host' } };
    const service = new ComponentPreviewService({ sources: { getItem: () => item }, workspace: { getRoot: () => 'D:/project' }, preview: { render } as never, cacheRoot, loadConfig: (() => config) as never });
    const result = await service.render({ sourceId: 'source', componentId: 'card', workspaceId: 'workspace' });
    expect(result.width).toBe(320);
    const request = render.mock.calls[0]![0];
    expect(await readFile(request.uiFile, 'utf8')).toContain('QWidget');
    expect(await readFile(request.profile.stylesheets[0]!, 'utf8')).toBe('QWidget{}');
  });

  it('renders without a workspace by using the configured default Qt Kit', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'component-preview-default-kit-'));
    const render = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const item = { sourceId: 'source', componentId: 'card', name: 'Card', description: 'Card', tags: [], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], license: { name: 'MIT' }, inferred: false, contentHash: 'b'.repeat(64), updatedAt: 1 };
    const service = new ComponentPreviewService({
      sources: { getItem: () => item },
      workspace: { getRoot: vi.fn() },
      preview: { render } as never,
      cacheRoot,
      sourceDirectory: 'D:/preview-host',
      defaultQtKit: () => ({ version: '5.9.6', rootDir: 'D:/Qt/5.9.6/msvc2015_64', binDirectory: 'D:/Qt/5.9.6/msvc2015_64/bin', uic: 'uic.exe', rcc: 'rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' }),
    });

    await service.render({ sourceId: 'source', componentId: 'card' });

    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ mode: 'enhanced', width: 900, height: 640 }),
      qt: expect.objectContaining({ version: '5.9.6', cmakePrefixPath: 'D:/Qt/5.9.6/msvc2015_64' }),
      sourceDirectory: 'D:/preview-host',
    }));
  });

  it('uses the selected default Qt Kit when an opened project has no portable Qt profile yet', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'component-preview-project-fallback-'));
    const render = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const item = { sourceId: 'source', componentId: 'card', name: 'Card', description: 'Card', tags: [], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], license: { name: 'MIT' }, inferred: false, contentHash: 'd'.repeat(64), updatedAt: 1 };
    const service = new ComponentPreviewService({ sources: { getItem: () => item }, workspace: { getRoot: () => 'D:/project' }, preview: { render } as never, cacheRoot, loadConfig: (() => ({ preview: { width: 320, height: 200, locale: 'zh_CN', style: 'Fusion', pluginPaths: [] } })) as never, defaultQtKit: () => ({ version: '5.9.6', rootDir: 'D:/Qt', binDirectory: 'D:/Qt/bin', uic: 'uic.exe', rcc: 'rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' }) });

    await service.render({ sourceId: 'source', componentId: 'card', workspaceId: 'workspace' });

    expect(render).toHaveBeenCalledWith(expect.objectContaining({ qt: expect.objectContaining({ version: '5.9.6', binDirectory: 'D:/Qt/bin' }) }));
  });

  it('falls back to the selected default Qt Kit when the project profile points to missing tools', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'component-preview-stale-kit-'));
    const render = vi.fn(async () => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 900, height: 640, findings: [], degradedFeatures: [], confidence: 1 }));
    const item = { sourceId: 'source', componentId: 'card', name: 'Card', description: 'Card', tags: [], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], license: { name: 'MIT' }, inferred: false, contentHash: 'e'.repeat(64), updatedAt: 1 };
    const staleConfig = { qt: { version: '5.9.6', compilerAbi: 'msvc2015_64', architecture: 'x86_64', binDirectory: 'Z:/missing/bin', uic: 'Z:/missing/uic.exe', rcc: 'Z:/missing/rcc.exe', cmake: 'cmake', cmakePrefixPath: 'Z:/missing' }, preview: { width: 320, height: 200, locale: 'zh_CN', style: 'Fusion', pluginPaths: [] } };
    const service = new ComponentPreviewService({ sources: { getItem: () => item }, workspace: { getRoot: () => 'D:/project' }, preview: { render } as never, cacheRoot, loadConfig: (() => staleConfig) as never, defaultQtKit: () => ({ version: '5.9.6', rootDir: 'D:/Qt5.9.6/5.9.6/msvc2015_64', binDirectory: 'D:/Qt5.9.6/5.9.6/msvc2015_64/bin', uic: 'D:/Qt5.9.6/5.9.6/msvc2015_64/bin/uic.exe', rcc: 'D:/Qt5.9.6/5.9.6/msvc2015_64/bin/rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' }) });

    await service.render({ sourceId: 'source', componentId: 'card', workspaceId: 'workspace' });

    expect(render).toHaveBeenCalledWith(expect.objectContaining({ qt: expect.objectContaining({ binDirectory: 'D:/Qt5.9.6/5.9.6/msvc2015_64/bin' }) }));
  });

  it('stages the vendored MaterialDark stylesheet for a GTRONICK component preview', async () => {
    const sourceRoot = path.resolve(__dirname, '../../../../../resources/external-component-libraries/gtronick-qss');
    const items = await new LocalComponentSourceAdapter().discover({ sourceId: 'gtronick-qss', rootDir: sourceRoot, discovery: 'manifest' });
    const item = items.find((candidate) => candidate.componentId === 'gtronick-buttons');
    expect(item).toBeTruthy();
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'gtronick-component-preview-'));
    const render = vi.fn(async (_input: { profile: { stylesheets: string[] } }) => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 360, height: 190, findings: [], degradedFeatures: [], confidence: 1 }));
    const service = new ComponentPreviewService({
      sources: { getItem: () => item },
      workspace: { getRoot: vi.fn() },
      preview: { render } as never,
      cacheRoot,
      sourceDirectory: 'D:/preview-host',
      defaultQtKit: () => ({ version: '5.9.6', rootDir: 'D:/Qt/5.9.6/msvc2015_64', binDirectory: 'D:/Qt/5.9.6/msvc2015_64/bin', uic: 'uic.exe', rcc: 'rcc.exe' }),
    });

    await service.render({ sourceId: 'gtronick-qss', componentId: 'gtronick-buttons' });

    const request = render.mock.calls[0]![0];
    expect(request.profile.stylesheets).toHaveLength(1);
    expect(await readFile(request.profile.stylesheets[0]!, 'utf8')).toContain('Material Dark Style Sheet for QT Applications');
    expect(await readFile(request.profile.stylesheets[0]!, 'utf8')).toContain('QPushButton');
  });

  it('builds an isolated PreviewHost factory for a ready source control', async () => {
    const cacheRoot = await mkdtemp(path.join(tmpdir(), 'source-control-preview-'));
    const render = vi.fn(async (_input: { uiFile: string; componentBuild?: { factory: string; sources: string[]; headers: string[]; includeDirs: string[] } }) => ({ imageDataUrl: 'data:image/png;base64,AA==', mode: 'enhanced' as const, imagePath: path.join(cacheRoot, 'preview.png'), width: 480, height: 180, findings: [], degradedFeatures: [], confidence: 1 }));
    const item = { sourceId: 'source', componentId: 'wave', name: 'Wave', description: 'Wave', tags: [], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], license: { name: 'Local' }, inferred: true, contentHash: 'c'.repeat(64), updatedAt: 1 };
    const sourceHeader = path.join(cacheRoot, '控件库', 'Widget', 'AudioVolumeWaveBar.h');
    await mkdir(path.dirname(sourceHeader), { recursive: true }); await writeFile(sourceHeader, 'class AudioVolumeWaveBar {};');
    const build = { className: 'AudioVolumeWaveBar', baseClass: 'QWidget' as const, header: sourceHeader, headerInclude: 'Widget/AudioVolumeWaveBar.h', dependencyHeaders: [{ absolute: sourceHeader, relative: 'Widget/AudioVolumeWaveBar.h' }], sources: ['D:/Cloud/控件库/Widget/AudioVolumeWaveBar.cpp'], includeDirs: ['D:/Cloud/控件库'] };
    const service = new ComponentPreviewService({ sources: { getItem: () => item, getPreviewBuild: () => build }, workspace: { getRoot: vi.fn() }, preview: { render } as never, cacheRoot, sourceDirectory: 'D:/preview-host', defaultQtKit: () => ({ version: '5.9.6', rootDir: 'D:/Qt', binDirectory: 'D:/Qt/bin', uic: 'uic.exe', rcc: 'rcc.exe' }) });

    await service.render({ sourceId: 'source', componentId: 'wave' });

    const request = render.mock.calls[0]![0];
    expect(request.componentBuild).toMatchObject({ sources: build.sources, headers: [expect.stringContaining('AudioVolumeWaveBar.h')], includeDirs: [expect.stringContaining('component-headers'), ...build.includeDirs] });
    expect(await readFile(request.componentBuild!.headers[0]!, 'utf8')).toBe(await readFile(build.header, 'utf8'));
    expect(await readFile(request.uiFile, 'utf8')).toContain('class="AudioVolumeWaveBar"');
    expect(request.componentBuild).toBeDefined();
    const factory = await readFile(request.componentBuild!.factory, 'utf8');
    expect(factory).toContain('#include "Widget/AudioVolumeWaveBar.h"');
    expect(factory).not.toContain('D:/Cloud/控件库');
    expect(factory).toContain('new AudioVolumeWaveBar(parent)');
  });
});
