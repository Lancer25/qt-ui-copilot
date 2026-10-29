import { describe, expect, it } from 'vitest';
import { normalizeUiIntent } from '../src/index.js';
import type { CanonicalUiIntent } from '@qt-ui-copilot/contracts';

describe('normalizeUiIntent', () => {
  it('repairs and deduplicates names in depth-first order', () => {
    const input = {
      fileName: 'Login.ui', rootType: 'QWidget', rootObjectName: 'login-widget', windowTitle: '登录',
      size: { width: 520, height: 360 }, expectedResults: ['可输入账号'],
      tree: { kind: 'layout', role: 'main', layout: 'vertical', children: [
        { kind: 'widget', role: 'title', widget: 'label', objectName: 'title-label', text: '登录', children: [] },
        { kind: 'widget', role: 'title', widget: 'label', objectName: 'title-label', text: '重复', children: [] },
      ] },
    } as unknown as CanonicalUiIntent;
    const result = normalizeUiIntent(input);
    expect(result.intent.rootObjectName).toBe('login_widget');
    expect(result.intent.tree.children.map((child) => child.objectName)).toEqual(['title_label', 'title_label_2']);
    expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(['object_name_repaired', 'duplicate_name_repaired']));
  });

  it('degrades unsupported semantics and applies a safe default size', () => {
    const result = normalizeUiIntent({
      fileName: 'Untitled.ui', rootType: 'QWidget', rootObjectName: 'root', windowTitle: '', expectedResults: ['ok'],
      tree: { kind: 'layout', role: 'main', layout: 'stacked', children: [
        { kind: 'widget', role: 'unknown', widget: 'calendar', children: [] },
      ] },
    } as unknown as CanonicalUiIntent);
    expect(result.intent.size).toEqual({ width: 900, height: 640 });
    expect(result.intent.tree.layout).toBe('vertical');
    expect(result.intent.tree.children[0].widget).toBe('container');
    expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(['node_degraded', 'default_size_applied']));
  });

  it('infers visible Qt controls when the model omits widget kinds', () => {
    const result = normalizeUiIntent({
      fileName: 'Login.ui', rootType: 'QWidget', rootObjectName: 'login', windowTitle: '登录', expectedResults: ['可登录'],
      tree: { kind: 'layout', role: 'main', layout: 'vertical', children: [
        { kind: 'widget', role: 'title', text: '微信登录', children: [] },
        { kind: 'widget', role: 'account', text: '账号', children: [] },
        { kind: 'widget', role: 'password', text: '密码', children: [] },
        { kind: 'widget', role: 'remember', text: '记住密码', children: [] },
        { kind: 'widget', role: 'login', text: '登录', children: [] },
      ] },
    } as unknown as CanonicalUiIntent);
    expect(result.intent.tree.children.map((node) => node.widget)).toEqual(['label', 'lineEdit', 'lineEdit', 'checkBox', 'button']);
    expect(result.intent.tree.children[1]).toMatchObject({ placeholder: '账号' });
    expect(result.intent.tree.children[1].text).toBeUndefined();
    expect(result.warnings.filter((warning) => warning.code === 'widget_inferred')).toHaveLength(5);
  });
});
