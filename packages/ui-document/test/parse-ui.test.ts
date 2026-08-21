import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildUiFingerprint, parseUi } from '../src/index.js';

const fixturesDirectory = path.join(import.meta.dirname, 'fixtures');

describe('parseUi', () => {
  for (const fixture of ['qt59-settings.ui', 'qt6-settings.ui']) {
    it(`round-trips ${fixture} byte-for-byte when unchanged`, () => {
      const source = readFileSync(path.join(fixturesDirectory, fixture), 'utf8');
      const document = parseUi(source, fixture);

      expect(document.source).toBe(source);
      expect(document.index.widgetsByName.get('saveButton')?.className).toBe('QPushButton');
      expect(document.root.source).toBe(source.slice(document.root.range.start, document.root.range.end));
    });
  }

  it('indexes layouts, properties, items, connections, tab stops, resources and custom widgets', () => {
    const source = readFileSync(path.join(fixturesDirectory, 'qt59-settings.ui'), 'utf8');
    const document = parseUi(source, 'qt59-settings.ui');
    const fingerprint = buildUiFingerprint(document);

    expect(document.index.layoutsByName.get('mainLayout')?.className).toBe('QVBoxLayout');
    expect(document.index.propertiesByObject.get('saveButton')?.get('text')?.valueText).toBe('保存');
    expect(document.index.items).toHaveLength(2);
    expect(document.index.connections).toEqual([{ sender: 'saveButton', signal: 'clicked()', receiver: 'SettingsDialog', slot: 'accept()' }]);
    expect(document.index.tabStops).toEqual(['serverLineEdit', 'saveButton']);
    expect(document.index.resources).toEqual([{ location: 'settings.qrc' }]);
    expect(fingerprint.widgetNames).toEqual(expect.arrayContaining(['saveButton', 'serverLineEdit']));
  });

  it('preserves unknown XML nodes in the concrete syntax tree', () => {
    const source = readFileSync(path.join(fixturesDirectory, 'qt6-settings.ui'), 'utf8');
    const document = parseUi(source, 'qt6-settings.ui');
    const node = document.root.children.find((child) => child.type === 'element' && child.name === 'widget');

    expect(node?.source).toContain('<modern-qt6-metadata enabled="true"><payload>keep-me</payload></modern-qt6-metadata>');
  });

  it('retains legacy enum text verbatim', () => {
    const source = readFileSync(path.join(fixturesDirectory, 'qt59-settings.ui'), 'utf8');
    const document = parseUi(source, 'qt59-settings.ui');

    expect(document.index.propertiesByObject.get('saveButton')?.get('orientation')?.valueText).toBe('Qt::Horizontal');
  });

  it('rejects duplicate object names', () => {
    const source = '<ui version="4.0"><class>X</class><widget class="QWidget" name="root"><widget class="QPushButton" name="duplicate"/><widget class="QLabel" name="duplicate"/></widget></ui>';
    expect(() => parseUi(source, 'duplicate.ui')).toThrow(/Duplicate object name "duplicate"/);
  });

  it('reports malformed XML with a line and column', () => {
    const malformed = '<ui>\n  <widget name="broken">\n</ui>';
    expect(() => parseUi(malformed, 'broken.ui')).toThrow(/broken\.ui:3:\d+:/);
  });
});
