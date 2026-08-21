import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchVisiblePage, PageBindingStore, type RuntimeWidgetTree } from '../src/index.js';
import type { UiFingerprint } from '@qt-ui-copilot/ui-document';

const fingerprint: UiFingerprint = {
  filePath: 'ui/NetworkSettings.ui', formClass: 'NetworkSettings', rootObjectName: 'networkSettingsDialog',
  widgetNames: ['networkSettingsDialog', 'proxyComboBox', 'serverLineEdit', 'testConnectionButton'],
  widgetClasses: ['QDialog', 'QComboBox', 'QLineEdit', 'QPushButton'],
  layoutNames: ['mainLayout'], layoutClasses: ['QVBoxLayout'], resourceLocations: [], customWidgetClasses: [],
};

const runtime: RuntimeWidgetTree = {
  objectName: 'networkSettingsDialog', className: 'NetworkSettings', layoutClass: 'QVBoxLayout', text: '', children: [
    { objectName: 'proxyComboBox', className: 'QComboBox', text: '', children: [] },
    { objectName: 'serverLineEdit', className: 'QLineEdit', text: '', children: [] },
    { objectName: 'testConnectionButton', className: 'QPushButton', text: 'Test connection', children: [] },
  ],
};

describe('matchVisiblePage', () => {
  it('auto-binds only at or above 0.90', () => {
    expect(matchVisiblePage(fingerprint, runtime).decision).toMatchObject({ kind: 'auto' });
    expect(matchVisiblePage(fingerprint, {
      ...runtime, objectName: 'unrelatedDialog', children: [runtime.children[0]],
    }).decision.kind).toBe('reject');
  });

  it('returns confirmation for an ambiguous score and exposes weighted evidence', () => {
    const result = matchVisiblePage(fingerprint, {
      ...runtime, objectName: 'networkSettingsGeneratedDialog', children: runtime.children,
    });
    expect(result.decision.kind).toBe('confirm');
    expect(result.components).toEqual(expect.objectContaining({ rootName: 0.5, childNames: 1, layouts: 1 }));
  });

  it('persists a user-confirmed binding for future runtime sessions', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'qt-ui-copilot-bindings-')), 'bindings.json');
    new PageBindingStore(file).confirm({ uiFile: fingerprint.filePath, runtimeRootObjectName: 'networkSettingsGeneratedDialog', confirmedAt: '2026-08-21T00:00:00.000Z' });
    expect(new PageBindingStore(file).get(fingerprint.filePath)).toMatchObject({ runtimeRootObjectName: 'networkSettingsGeneratedDialog' });
  });
});
