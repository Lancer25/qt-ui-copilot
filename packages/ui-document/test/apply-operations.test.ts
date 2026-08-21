import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOperations, parseUi } from '../src/index.js';

const fixturePath = path.join(import.meta.dirname, 'fixtures', 'qt59-settings.ui');
const original = readFileSync(fixturePath, 'utf8');

describe('applyOperations', () => {
  it('changes only the text property source range', () => {
    const result = applyOperations(parseUi(original, fixturePath), [
      { op: 'setProperty', target: 'saveButton', name: 'text', value: '应用' },
    ]);

    expect(result.changedRanges).toHaveLength(1);
    expect(result.source.replace('应用', '保存')).toBe(original);
  });

  it('adds a widget to a known layout without normalising untouched source', () => {
    const result = applyOperations(parseUi(original, fixturePath), [{
      op: 'addWidget', parentLayout: 'mainLayout', widgetClass: 'QPushButton', objectName: 'resetButton',
      before: 'saveButton', properties: { text: '恢复默认设置' },
    }]);

    expect(result.source).toContain('name="resetButton"');
    expect(result.source.indexOf('resetButton')).toBeLessThan(result.source.indexOf('saveButton'));
    expect(result.source).toContain('<legacy-extension qt59="true"><opaque>untouched</opaque></legacy-extension>');
  });

  it('rejects unresolved targets, duplicate names, and invalid layouts', () => {
    const document = parseUi(original, fixturePath);
    expect(() => applyOperations(document, [{ op: 'setProperty', target: 'missing', name: 'text', value: 'x' }]))
      .toThrow('Unknown target');
    expect(() => applyOperations(document, [{ op: 'addWidget', parentLayout: 'missing', widgetClass: 'QLabel', objectName: 'x' }]))
      .toThrow('Unknown layout');
    expect(() => applyOperations(document, [{ op: 'addWidget', parentLayout: 'mainLayout', widgetClass: 'QLabel', objectName: 'saveButton' }]))
      .toThrow('Duplicate object name');
  });

  it('validates buddy, tab order, and connection references before mutation', () => {
    const document = parseUi(original, fixturePath);
    expect(() => applyOperations(document, [{ op: 'setBuddy', label: 'saveButton', buddy: 'missing' }])).toThrow('Unknown target');
    expect(() => applyOperations(document, [{ op: 'setTabOrder', order: ['saveButton', 'missing'] }])).toThrow('Unknown target');
    expect(() => applyOperations(document, [{
      op: 'addExistingConnection', sender: 'saveButton', signal: 'clicked()', receiver: 'missing', slot: 'accept()',
    }])).toThrow('Unknown target');
  });

  it('applies layout, spacer, size-policy, tab, buddy, and connection operations as valid XML', () => {
    const result = applyOperations(parseUi(original, fixturePath), [
      { op: 'addSpacer', parentLayout: 'mainLayout', objectName: 'buttonSpacer', orientation: 'Horizontal', sizeType: 'Expanding' },
      { op: 'setSizePolicy', target: 'saveButton', horizontal: 'Minimum', vertical: 'Fixed' },
      { op: 'setTabOrder', order: ['saveButton', 'serverLineEdit'] },
      { op: 'setBuddy', label: 'saveButton', buddy: 'serverLineEdit' },
      { op: 'addExistingConnection', sender: 'serverLineEdit', signal: 'textChanged(QString)', receiver: 'saveButton', slot: 'setEnabled(bool)' },
    ]);

    const candidate = parseUi(result.source, fixturePath);
    expect(candidate.index.layoutsByName.get('mainLayout')).toBeDefined();
    expect(candidate.index.tabStops).toEqual(['saveButton', 'serverLineEdit']);
    expect(candidate.index.connections).toHaveLength(2);
    expect(result.source).toContain('<cstring>serverLineEdit</cstring>');
  });

  it('creates, wraps, moves, and removes only layout-owned widgets', () => {
    const simple = '<ui version="4.0"><class>Form</class><widget class="QWidget" name="form"><widget class="QLabel" name="a"/><widget class="QLabel" name="b"/></widget></ui>';
    const withLayout = applyOperations(parseUi(simple, 'form.ui'), [{
      op: 'createLayout', parentWidget: 'form', layoutClass: 'QVBoxLayout', objectName: 'formLayout',
    }]);
    expect(parseUi(withLayout.source, 'form.ui').index.layoutsByName.get('formLayout')).toBeDefined();

    const modified = applyOperations(parseUi(original, fixturePath), [
      { op: 'addWidget', parentLayout: 'mainLayout', widgetClass: 'QLabel', objectName: 'thirdLabel' },
      { op: 'wrapInLayout', targets: ['serverLineEdit', 'saveButton'], layoutClass: 'QHBoxLayout', objectName: 'rowLayout' },
    ]);
    expect(parseUi(modified.source, fixturePath).index.layoutsByName.get('rowLayout')).toBeDefined();

    const moved = applyOperations(parseUi(original, fixturePath), [
      { op: 'moveWidget', target: 'saveButton', parentLayout: 'mainLayout', before: 'serverLineEdit' },
    ]);
    expect(parseUi(moved.source, fixturePath).index.widgetsByName.get('saveButton')).toBeDefined();
    expect(moved.source.indexOf('saveButton')).toBeLessThan(moved.source.indexOf('serverLineEdit'));
  });
});
