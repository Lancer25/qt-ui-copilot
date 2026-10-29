import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComponentCatalog } from '@qt-ui-copilot/component-library';
import { generateBaseUi } from '@qt-ui-copilot/ui-document';
import type { CanonicalUiIntent } from '@qt-ui-copilot/contracts';
import { materializeComponents } from './component-materializer';

describe('materializeComponents', () => {
  it('replaces a semantic placeholder with an indexed component fragment', async () => {
    const catalog = new ComponentCatalog();
    await catalog.indexLibrary(path.resolve(process.cwd(), '../../fixtures/component-library'));
    const intent: CanonicalUiIntent = {
      fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'main', windowTitle: 'Main', expectedResults: ['组件可见'],
      tree: { kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [
        { kind: 'widget', role: 'network', widget: 'container', objectName: 'componentSlot', capabilityId: 'local.ui_fragment.network-connection-panel', children: [] },
      ] },
    };
    const result = materializeComponents({ source: generateBaseUi(intent).source, intent, candidates: [{ capabilityId: 'local.ui_fragment.network-connection-panel', displayName: '网络连接测试区域', kind: 'ui_fragment', description: '连接', tags: [], dependencyStatus: 'ready', reasons: [] }], catalog });

    expect(result.source).toContain('networkConnectionPanel');
    expect(result.source).not.toContain('name="componentSlot"');
    expect(result.componentIds).toEqual(['network-connection-panel']);
    expect(result.warnings).toEqual([]);
    catalog.close();
  });

  it('appends an explicitly selected component when the model omits its capability id', async () => {
    const catalog = new ComponentCatalog();
    await catalog.indexLibrary(path.resolve(process.cwd(), '../../fixtures/component-library'));
    const intent: CanonicalUiIntent = { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'main', windowTitle: 'Main', expectedResults: ['组件可见'], tree: { kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [] } };
    const result = materializeComponents({ source: generateBaseUi(intent).source, intent, candidates: [{ capabilityId: 'local.ui_fragment.network-connection-panel', displayName: '网络连接测试区域', kind: 'ui_fragment', description: '连接', tags: [], dependencyStatus: 'ready', reasons: [] }], catalog });
    expect(result.source).toContain('networkConnectionPanel');
    expect(result.componentIds).toEqual(['network-connection-panel']);
    catalog.close();
  });

  it('materializes normalized source capabilities and returns their QSS content', async () => {
    const catalog = new ComponentCatalog();
    await catalog.indexLibrary(path.resolve(process.cwd(), '../../fixtures/component-library'));
    const record = catalog.get('network-connection-panel')!;
    const intent: CanonicalUiIntent = { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'main', windowTitle: 'Main', expectedResults: ['组件可见'], tree: { kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [] } };
    const capabilityId = 'source.remote.abc.network-panel';
    const result = materializeComponents({
      source: generateBaseUi(intent).source,
      intent,
      candidates: [{ capabilityId, displayName: '网络面板', kind: 'ui_fragment', description: '连接', tags: [], dependencyStatus: 'ready', reasons: [] }],
      catalog: { get: (id) => catalog.get(id), getByCapabilityId: (id) => id === capabilityId ? record : undefined, getStylesheetsByCapabilityId: (id) => id === capabilityId ? ['QFrame { border: 0; }'] : [] },
    });
    expect(result.source).toContain('networkConnectionPanel');
    expect(result.stylesheets).toEqual(['QFrame { border: 0; }']);
    catalog.close();
  });

  it('materializes an approved binary mapping as a real promoted widget, never as a UI fragment', () => {
    const intent: CanonicalUiIntent = { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'main', windowTitle: 'Main', expectedResults: ['组件可见'], tree: { kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [] } };
    const record = {
      id: 'fancy-card', name: 'Fancy Card', description: '动态卡片', tags: ['dynamic'], sourceProject: 'binary-source', sourceUiFile: 'include/FancyCard.hpp', rootObjectName: 'FancyCard',
      // This inert placeholder is deliberately not consumed by the binary path.
      uiFragment: '<item><widget class="QWidget" name="neverUseFragment"/></item>', structureSummary: 'FancyCard', screenshotPaths: [], widgetClasses: [], layoutTypes: [], qssDependencies: [], qrcDependencies: [], customWidgets: [], connections: [],
      binaryBuild: { className: 'FancyCard', baseClass: 'QWidget' as const, headerPath: 'include/FancyCard.hpp', includeDir: 'include', libPath: 'lib/FancyCard.lib', libDir: 'lib', dllPath: 'bin/FancyCard.dll', runtimeDllPaths: ['bin/FancySupport.dll'], qssPath: 'styles/fancy.qss', qrcPath: 'resources/fancy.qrc', qtModules: ['Widgets'], sourceRoot: 'C:/Components/Fancy' },
    };
    const capabilityId = 'source.binary.abc.fancy-card';
    const result = materializeComponents({ source: generateBaseUi(intent).source, intent, candidates: [{ capabilityId, displayName: 'Fancy Card', kind: 'promoted_widget', description: '动态卡片', tags: [], dependencyStatus: 'ready', reasons: ['approved'] }], catalog: { get: () => undefined, getByCapabilityId: (id) => id === capabilityId ? record : undefined } });
    expect(result.source).toContain('<class>FancyCard</class>');
    expect(result.source).toContain('<header>include/FancyCard.hpp</header>');
    expect(result.source).toContain('<widget class="FancyCard" name="componentSlot1"/>');
    expect(result.source).not.toContain('neverUseFragment');
    expect(result.binaryComponents).toEqual([record.binaryBuild]);
  });

  it('does not materialize a blocked binary candidate or emit build metadata', () => {
    const intent: CanonicalUiIntent = { fileName: 'Main.ui', rootType: 'QWidget', rootObjectName: 'main', windowTitle: 'Main', expectedResults: ['保持界面不变'], tree: { kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [] } };
    const source = generateBaseUi(intent).source;
    const result = materializeComponents({ source, intent, candidates: [{ capabilityId: 'source.binary.pending.card', displayName: 'Pending Card', kind: 'promoted_widget', description: '待配置', tags: [], dependencyStatus: 'blocked', reasons: ['ABI 不兼容'] }], catalog: { get: () => undefined } });
    expect(result.source).toBe(source);
    expect(result.binaryComponents).toEqual([]);
    expect(result.componentIds).toEqual([]);
  });
});
