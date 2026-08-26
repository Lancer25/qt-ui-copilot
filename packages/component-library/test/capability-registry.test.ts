import { describe, expect, it } from 'vitest';
import type { UiCapability } from '@qt-ui-copilot/contracts';
import { UiCapabilityRegistry, type UiCapabilitySource } from '../src/index.js';

const capability = (id: string, source: UiCapability['source']['type'] = 'builtin', minVersion = '5.9.6'): UiCapability => ({
  id, kind: 'qt_widget', displayName: id, description: 'test capability', tags: ['test'],
  qt: { minVersion, modules: ['Widgets'], verifiedKitIds: [] }, designer: { className: 'QWidget', container: true },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] }, source: { type: source },
});

const source = (...items: UiCapability[]): UiCapabilitySource => ({ list: () => items });

describe('UiCapabilityRegistry', () => {
  it('merges, filters by Qt kit and sorts deterministically', () => {
    const registry = new UiCapabilityRegistry([source(capability('qt.widgets.QPushButton')), source(capability('local.login-panel', 'local_library'))]);
    expect(registry.listForKit({ id: 'qt59', version: '5.9.6', modules: ['Widgets'] }).map((item) => item.id)).toEqual(['local.login-panel', 'qt.widgets.QPushButton']);
    expect(new UiCapabilityRegistry([source(capability('qt6.only', 'builtin', '6.0.0'))]).listForKit({ version: '5.9.6', modules: ['Widgets'] })).toEqual([]);
  });

  it('rejects conflicting records with the same stable id', () => {
    expect(() => new UiCapabilityRegistry([source(capability('same')), source({ ...capability('same'), description: 'other' })])).toThrow(/Conflicting/);
  });

  it('returns bounded model candidates from search', () => {
    const registry = new UiCapabilityRegistry([source(capability('qt.widgets.QPushButton'))]);
    expect(registry.search({ text: 'QPushButton', limit: 1 })[0]).toMatchObject({ capabilityId: 'qt.widgets.QPushButton', dependencyStatus: 'ready' });
  });
});

