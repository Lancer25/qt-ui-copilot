import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactStore } from '@qt-ui-copilot/project-core';
import { ComponentCatalog, UnconfiguredVectorSearchAdapter } from '../src/index.js';

const libraryRoot = path.resolve(import.meta.dirname, '../../../fixtures/component-library');

describe('ComponentCatalog', () => {
  it('finds a connection panel without a vector service', async () => {
    const catalog = new ComponentCatalog({ vectorAdapter: new UnconfiguredVectorSearchAdapter() });
    await catalog.indexLibrary(libraryRoot);

    const [first] = await catalog.search({ text: '连接测试区域', requiredWidgets: ['QPushButton'] });

    expect(first.componentId).toBe('network-connection-panel');
    expect(first.score).toBeGreaterThan(0);
    expect(first.missingDependencies).toEqual([]);
    expect(catalog.get('network-connection-panel')?.rootObjectName).toBe('networkConnectionPanel');
    expect(catalog.list().map((component) => component.id)).toContain('network-connection-panel');
  });

  it('ranks compatible metadata and never requires the optional vector adapter', async () => {
    const catalog = new ComponentCatalog();
    await catalog.indexLibrary(libraryRoot);

    const [first] = await catalog.search({
      text: 'network connection', requiredLayouts: ['QFormLayout'], qtVersion: '5.9.6', styleTags: ['settings'],
    });

    expect(first.component.id).toBe('network-connection-panel');
    expect(first.reasons).toContain('layout:QFormLayout');
  });

  it('filters out components that do not satisfy required Qt structures', async () => {
    const catalog = new ComponentCatalog();
    await catalog.indexLibrary(libraryRoot);

    await expect(catalog.search({ text: '连接', requiredWidgets: ['QTreeView'] })).resolves.toEqual([]);
  });

  it('indexes a PreviewClient screenshot into the contained artifact store', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-ui-copilot-component-'));
    const previewImage = path.join(root, 'preview.png');
    writeFileSync(previewImage, 'fake-image');
    const render = vi.fn().mockResolvedValue({ success: true, imagePath: previewImage, findings: [], degradedFeatures: [] });
    const catalog = new ComponentCatalog({
      previewClient: { render } as never,
      artifactStore: new ArtifactStore(path.join(root, 'artifacts')),
    });

    await catalog.indexLibrary(libraryRoot);
    const [first] = await catalog.search({ text: '连接测试区域' });

    expect(render).toHaveBeenCalledOnce();
    expect(first.component.screenshotPaths).toHaveLength(1);
    expect(readFileSync(first.component.screenshotPaths[0], 'utf8')).toBe('fake-image');
  });
});
