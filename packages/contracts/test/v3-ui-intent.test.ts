import { describe, expect, it } from 'vitest';
import { CanonicalUiIntentSchema, CanonicalUiNodeSchema } from '../src/index.js';

const validIntent = {
  fileName: 'Login.ui',
  rootType: 'QWidget',
  rootObjectName: 'login',
  windowTitle: '登录',
  size: { width: 520, height: 360 },
  tree: { kind: 'layout', role: 'main', layout: 'vertical', children: [] },
  expectedResults: ['可以输入账号和密码'],
};

describe('Canonical UI intent contract', () => {
  it('accepts a restricted semantic intent', () => {
    expect(CanonicalUiIntentSchema.parse(validIntent)).toMatchObject({ rootType: 'QWidget', tree: { layout: 'vertical' } });
  });

  it('allows omitted size for the normalizer to default later', () => {
    const { size: _size, ...withoutSize } = validIntent;
    expect(CanonicalUiIntentSchema.parse(withoutSize).size).toBeUndefined();
  });

  it('rejects raw XML and arbitrary properties', () => {
    expect(() => CanonicalUiIntentSchema.parse({ rawXml: '<ui/>' })).toThrow();
    expect(() => CanonicalUiIntentSchema.parse({ ...validIntent, rawXml: '<ui/>' })).toThrow();
    expect(() => CanonicalUiIntentSchema.parse({ ...validIntent, tree: { ...validIntent.tree, properties: { font: {} } } })).toThrow();
  });

  it('rejects invalid file names, roots and semantic vocabulary', () => {
    expect(() => CanonicalUiIntentSchema.parse({ ...validIntent, fileName: '../Login.ui' })).toThrow();
    expect(() => CanonicalUiIntentSchema.parse({ ...validIntent, rootType: 'QQuickView' })).toThrow();
    expect(() => CanonicalUiIntentSchema.parse({ ...validIntent, tree: { ...validIntent.tree, layout: 'stacked' } })).toThrow();
  });

  it('defaults child collections while preserving nested structure', () => {
    const node = CanonicalUiNodeSchema.parse({ kind: 'widget', role: 'title', widget: 'label', text: 'Hello' });
    expect(node.children).toEqual([]);
  });
});

