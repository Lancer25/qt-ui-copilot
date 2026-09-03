import { describe, expect, it } from 'vitest';
import { generateUiFromBlueprint } from '../src/index.js';
import type { UiCreationBlueprint } from '@qt-ui-copilot/contracts';

const loginBlueprint: UiCreationBlueprint = {
  fileName: 'LoginDialog.ui', rootType: 'QDialog', rootObjectName: 'loginDialog', windowTitle: 'Sign in', size: { width: 520, height: 360 },
  layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: { spacing: 12 }, children: [
    { kind: 'widget', className: 'QLabel', objectName: 'titleLabel', properties: { text: 'Sign in' }, children: [] },
    { kind: 'widget', className: 'QLineEdit', objectName: 'userEdit', properties: { placeholderText: 'User name' }, children: [] },
    { kind: 'widget', className: 'QPushButton', objectName: 'submitButton', properties: { text: 'Submit' }, children: [] },
  ] },
  tabOrder: ['userEdit', 'submitButton'], connections: [{ sender: 'submitButton', signal: 'clicked()', receiver: 'loginDialog', slot: 'accept()' }], resourceRefs: ['icons.qrc'], componentIds: [], expectedResults: ['A usable login dialog'],
};

describe('generateUiFromBlueprint', () => {
  it('generates byte-identical Qt Designer XML for the same blueprint', () => {
    const first = generateUiFromBlueprint(loginBlueprint);
    const second = generateUiFromBlueprint(loginBlueprint);
    expect(first.source).toBe(second.source);
    expect(first.source).toContain('<ui version="4.0">');
    expect(first.objectNames).toEqual(['loginDialog', 'mainLayout', 'titleLabel', 'userEdit', 'submitButton']);
  });

  it('rejects duplicate objects but accepts Qt 5/Qt 6/custom class names', () => {
    const duplicate = structuredClone(loginBlueprint);
    duplicate.layoutTree.children[1].objectName = 'titleLabel';
    expect(() => generateUiFromBlueprint(duplicate)).toThrow('duplicate objectName');
    const custom = structuredClone(loginBlueprint);
    custom.layoutTree.children[0].className = 'QQuickView';
    expect(() => generateUiFromBlueprint(custom)).not.toThrow();
  });

  it('rejects cyclic trees before schema parsing', () => {
    const cyclic = structuredClone(loginBlueprint) as unknown as { layoutTree: { children: unknown[] } };
    cyclic.layoutTree.children.push(cyclic.layoutTree);
    expect(() => generateUiFromBlueprint(cyclic as UiCreationBlueprint)).toThrow('cycle');
  });

  it('accepts standard main-window support widgets such as QStatusBar', () => {
    const blueprint = structuredClone(loginBlueprint);
    blueprint.layoutTree.children.push({ kind: 'widget', className: 'QStatusBar', objectName: 'statusBar', properties: {}, children: [] });
    expect(() => generateUiFromBlueprint(blueprint)).not.toThrow();
  });

  it('drops tab stops that reference omitted or renamed widgets', () => {
    const blueprint = structuredClone(loginBlueprint);
    blueprint.tabOrder = ['missingEdit', 'userEdit', 'anotherMissing'] as string[];
    const result = generateUiFromBlueprint(blueprint);
    expect(result.source).toContain('<tabstop>userEdit</tabstop>');
    expect(result.source).not.toContain('missingEdit');
    expect(result.source).not.toContain('anotherMissing');
  });

  it('drops connections that reference unknown objects', () => {
    const blueprint = structuredClone(loginBlueprint);
    blueprint.connections.push({ sender: 'missingButton', signal: 'clicked()', receiver: 'loginDialog', slot: 'accept()' });
    const result = generateUiFromBlueprint(blueprint);
    expect(result.source).toContain('<sender>submitButton</sender>');
    expect(result.source).not.toContain('missingButton');
  });
});
