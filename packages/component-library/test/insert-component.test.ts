import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComponentRecordSchema } from '@qt-ui-copilot/contracts';
import { applyOperations, parseUi } from '@qt-ui-copilot/ui-document';
import { buildInsertComponentOperation } from '../src/index.js';

const targetPath = path.resolve(import.meta.dirname, '../../ui-document/test/fixtures/qt59-settings.ui');
const target = parseUi(readFileSync(targetPath, 'utf8'), targetPath);

const customCandidate = ComponentRecordSchema.parse({
  id: 'network-graph', name: '网络图', description: '需要自定义网络图控件', tags: [],
  sourceProject: 'fixture', sourceUiFile: 'network-graph.ui', rootObjectName: 'networkGraph',
  uiFragment: '<item><widget class="NetworkGraphWidget" name="networkGraph"/></item>', structureSummary: 'graph',
  customWidgets: [{ className: 'NetworkGraphWidget', plugin: 'network-designer-plugin' }],
});

describe('safe component insertion', () => {
  it('blocks insertion when a promoted widget dependency is absent', () => {
    expect(() => buildInsertComponentOperation(customCandidate, target, {
      parentLayout: 'mainLayout', objectPrefix: 'graph',
    })).toThrow('Missing custom widget NetworkGraphWidget');
  });

  it('renames conflicting objects and rewrites internal buddy, tab, and connection references', () => {
    const candidate = ComponentRecordSchema.parse({
      id: 'conflicting-panel', name: '冲突区域', description: '用于验证安全重命名', tags: [],
      sourceProject: 'fixture', sourceUiFile: 'panel.ui', rootObjectName: 'panel', structureSummary: 'panel',
      uiFragment: '<item><widget class="QWidget" name="saveButton"><layout class="QVBoxLayout" name="innerLayout"><item><widget class="QLineEdit" name="serverLineEdit"/></item><item><widget class="QLabel" name="label"><property name="buddy"><cstring>serverLineEdit</cstring></property></widget></item></layout></widget><connections><connection><sender>saveButton</sender><signal>changed()</signal><receiver>serverLineEdit</receiver><slot>clear()</slot></connection></connections><tabstops><tabstop>serverLineEdit</tabstop></tabstops></item>',
    });
    const prepared = buildInsertComponentOperation(candidate, target, { parentLayout: 'mainLayout', objectPrefix: 'connection' });
    const result = applyOperations(target, [prepared.operation], { resolveComponent: prepared.resolveComponent });

    expect(result.source).toContain('name="connection_saveButton"');
    expect(result.source).toContain('<cstring>connection_serverLineEdit</cstring>');
    expect(result.source).toContain('<sender>connection_saveButton</sender>');
    expect(result.source).toContain('<tabstop>connection_serverLineEdit</tabstop>');
    expect(parseUi(result.source, targetPath).index.widgetsByName.get('connection_saveButton')).toBeDefined();
  });

  it('returns QRC and stylesheet dependencies before patch creation', () => {
    const candidate = ComponentRecordSchema.parse({
      id: 'styled', name: '样式区域', description: '需要资源和样式', tags: [], sourceProject: 'fixture',
      sourceUiFile: 'styled.ui', rootObjectName: 'styled', structureSummary: 'styled',
      uiFragment: '<item><widget class="QLabel" name="styledLabel"/></item>', qrcDependencies: ['missing.qrc'], qssDependencies: ['missing.qss'],
    });
    const prepared = buildInsertComponentOperation(candidate, target, { parentLayout: 'mainLayout', objectPrefix: 'styled' });

    expect(prepared.missingDependencies).toEqual(expect.arrayContaining([
      'Missing QRC dependency missing.qrc', 'Missing QSS dependency missing.qss',
    ]));
    expect(() => prepared.assertReady()).toThrow('Missing QRC dependency missing.qrc');
  });
});
