import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComponentCatalog } from '../src/catalog.js';

describe('bundled component catalogue', () => {
  it('indexes the complete Qt 5.9 standard-widget module pack', async () => {
    const catalog = new ComponentCatalog();
    const count = await catalog.indexLibrary(path.resolve(import.meta.dirname, '../../../resources/component-library'));
    expect(count).toBe(9);
    expect(catalog.list().map((component) => component.id)).toEqual(expect.arrayContaining([
      'login-card', 'metric-summary', 'filter-toolbar', 'settings-section',
      'empty-state', 'status-banner', 'pagination-bar', 'action-toolbar', 'data-table-panel',
    ]));
    expect(catalog.list().every((component) => component.qssDependencies.includes('../themes/modern-light.qss'))).toBe(true);
    catalog.close();
  });
});
