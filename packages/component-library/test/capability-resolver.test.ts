import { describe, expect, it } from 'vitest';
import type { UiCapability } from '@qt-ui-copilot/contracts';
import { UiCapabilityRegistry, UiCapabilityResolver } from '../src/index.js';

const promoted: UiCapability = {
  id: 'project.network-panel', kind: 'promoted_widget', displayName: 'Network Panel', description: 'test', tags: [],
  qt: { minVersion: '5.9.6', modules: ['Widgets'], verifiedKitIds: [] },
  designer: { className: 'NetworkPanel', baseClass: 'QWidget', header: 'widgets/NetworkPanel.h', container: true },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
  fallback: { capabilityId: 'qt.widgets.QWidget', reason: 'base widget' }, source: { type: 'project' },
};
const fallback: UiCapability = {
  id: 'qt.widgets.QWidget', kind: 'qt_widget', displayName: 'Widget', description: 'test', tags: [],
  qt: { minVersion: '5.9.6', modules: ['Widgets'], verifiedKitIds: [] }, designer: { className: 'QWidget', container: true },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] }, source: { type: 'builtin' },
};

describe('UiCapabilityResolver', () => {
  it('degrades a promoted widget when its header is missing', () => {
    const result = new UiCapabilityResolver(new UiCapabilityRegistry([{ list: () => [promoted, fallback] }])).resolve(promoted, { version: '5.9.6', modules: ['Widgets'], files: [], qss: [], qrc: [], fonts: [] });
    expect(result.status).toBe('degraded');
    expect(result.selectedCapabilityId).toBe(fallback.id);
    expect(result.findings[0].code).toBe('promoted_header_missing');
  });

  it('blocks an unsupported capability without a fallback', () => {
    const item = { ...fallback, fallback: undefined, qt: { ...fallback.qt, minVersion: '6.0.0' } };
    const result = new UiCapabilityResolver(new UiCapabilityRegistry([{ list: () => [item] }])).resolve(item, { version: '5.9.6', modules: ['Widgets'], files: [], qss: [], qrc: [], fonts: [] });
    expect(result.status).toBe('blocked');
    expect(result.findings[0].code).toBe('qt_version_incompatible');
  });
});

