import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LocalComponentSourceAdapter } from '../src/local-source-adapter.js';

const rootDir = fileURLToPath(new URL('../../../resources/external-component-libraries/gtronick-qss', import.meta.url));

describe('GTRONICK/QSS component source', () => {
  it('discovers seven composite modules plus independently reusable atomic controls with the upstream stylesheet', async () => {
    const items = await new LocalComponentSourceAdapter().discover({ sourceId: 'gtronick-qss', rootDir, discovery: 'manifest' });

    expect(items).toHaveLength(21);
    expect(new Set(items.map((item) => item.componentId)).size).toBe(21);
    expect(items.find((item) => item.componentId === 'atomic-qpushbutton')).toMatchObject({ name: '按钮', inferred: true, tags: expect.arrayContaining(['原子控件', 'QPushButton']) });
    for (const item of items) {
      expect(item).toMatchObject({ sourceId: 'gtronick-qss', qtVersionRange: '>=5.9.6 <7.0.0', license: { name: 'MIT License', spdx: 'MIT' } });
      expect(item.assets).toEqual([expect.objectContaining({ path: 'styles/MaterialDark.qss', kind: 'qss' })]);
      expect(item.assets[0]?.text).toContain('QPushButton');
    }
  });
});
