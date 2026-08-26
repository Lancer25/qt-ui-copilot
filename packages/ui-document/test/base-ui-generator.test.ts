import { describe, expect, it } from 'vitest';
import type { CanonicalUiIntent } from '@qt-ui-copilot/contracts';
import { generateBaseUi, parseUi } from '../src/index.js';

const loginIntent: CanonicalUiIntent = {
  fileName: 'Login.ui',
  rootType: 'QWidget',
  rootObjectName: 'loginPage',
  windowTitle: '登录',
  size: { width: 520, height: 360 },
  tree: {
    kind: 'layout', role: 'main', layout: 'vertical', objectName: 'mainLayout', children: [
      { kind: 'widget', role: 'title', widget: 'label', objectName: 'titleLabel', text: '登录', children: [] },
      { kind: 'widget', role: 'account', widget: 'lineEdit', objectName: 'accountEdit', placeholder: '账号', children: [] },
      { kind: 'widget', role: 'submit', widget: 'button', objectName: 'submitButton', text: '登录', children: [] },
    ],
  },
  expectedResults: ['可以输入账号并提交'],
};

describe('generateBaseUi', () => {
  it('generates a deterministic, parseable base document', () => {
    const first = generateBaseUi(loginIntent);
    const second = generateBaseUi(loginIntent);

    expect(first.source).toBe(second.source);
    expect(first.source).toMatchInlineSnapshot(`
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
      <ui version=\"4.0\">
       <class>loginPage</class>
       <widget class=\"QWidget\" name=\"loginPage\">
        <property name=\"geometry\"><rect><x>0</x><y>0</y><width>520</width><height>360</height></rect></property>
        <property name=\"windowTitle\"><string>登录</string></property>
        <layout class=\"QVBoxLayout\" name=\"mainLayout\">
         <item>
          <widget class=\"QLabel\" name=\"titleLabel\">
           <property name=\"text\"><string>登录</string></property>
          </widget>
         </item>
         <item>
          <widget class=\"QLineEdit\" name=\"accountEdit\">
           <property name=\"placeholderText\"><string>账号</string></property>
          </widget>
         </item>
         <item>
          <widget class=\"QPushButton\" name=\"submitButton\">
           <property name=\"text\"><string>登录</string></property>
          </widget>
         </item>
        </layout>
       </widget>
      </ui>
      "
    `);
    const parsed = parseUi(first.source, loginIntent.fileName);
    expect(parsed.index.layoutsByName.get('mainLayout')?.className).toBe('QVBoxLayout');
    expect(parsed.index.widgetsByName.get('submitButton')?.className).toBe('QPushButton');
  });

  it('maps grid and form layouts to deterministic item coordinates', () => {
    const intent = { ...loginIntent, tree: {
      kind: 'layout' as const, role: 'form', layout: 'form' as const, objectName: 'formLayout', children: [
        loginIntent.tree.children[0], loginIntent.tree.children[1],
      ],
    }};
    const generated = generateBaseUi(intent);
    expect(generated.source).toContain('<item row="0" column="0">');
    expect(generated.source).toContain('<item row="1" column="0">');
    expect(() => parseUi(generated.source, 'Form.ui')).not.toThrow();
  });

  it('rejects duplicate names before emitting a document', () => {
    const invalid = { ...loginIntent, tree: {
      ...loginIntent.tree,
      children: [loginIntent.tree.children[0], { ...loginIntent.tree.children[1], objectName: 'titleLabel' }],
    }};
    expect(() => generateBaseUi(invalid)).toThrow(/duplicate objectName/);
  });
});

