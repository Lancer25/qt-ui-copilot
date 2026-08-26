import { describe, expect, it } from 'vitest';
import { ensurePromotedWidget } from '../src/index.js';
import type { UiCapability } from '@qt-ui-copilot/contracts';

const capability: UiCapability = {
  id: 'project.promoted.NetworkPanel', kind: 'promoted_widget', displayName: 'NetworkPanel', description: 'test', tags: ['project'],
  qt: { minVersion: '5.9.6', modules: ['Widgets'], verifiedKitIds: [] },
  designer: { className: 'NetworkPanel', baseClass: 'QWidget', header: 'widgets/NetworkPanel.h', container: true },
  dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] }, source: { type: 'project', path: 'MainWindow.ui' },
};
const source = `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>MainWindow</class>\n <widget class="QWidget" name="MainWindow"/>\n</ui>\n`;

describe('ensurePromotedWidget', () => {
  it('inserts and validates a customwidget declaration', () => {
    const first = ensurePromotedWidget(source, capability);
    expect(first.inserted).toBe(true);
    expect(first.source).toContain('<header>widgets/NetworkPanel.h</header>');
    expect(first.source).toContain('<container>1</container>');
    const second = ensurePromotedWidget(first.source, capability);
    expect(second.inserted).toBe(false);
    expect((second.source.match(/<class>NetworkPanel<\/class>/g) ?? [])).toHaveLength(1);
  });

  it('merges with an existing customwidgets block', () => {
    const existing = source.replace('</ui>', ' <customwidgets><customwidget><class>Existing</class><extends>QWidget</extends></customwidget></customwidgets>\n</ui>');
    const result = ensurePromotedWidget(existing, capability);
    expect(result.source).toContain('<class>Existing</class>');
    expect(result.source).toContain('<class>NetworkPanel</class>');
  });
});

