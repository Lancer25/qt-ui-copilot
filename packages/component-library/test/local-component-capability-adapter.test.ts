import { describe, expect, it } from 'vitest';
import type { ComponentRecord } from '@qt-ui-copilot/contracts';
import { LocalComponentCapabilityAdapter } from '../src/index.js';

const component: ComponentRecord = {
  id: 'network-connection-panel',
  name: '网络连接测试区域',
  description: '提供服务器地址输入和连接测试按钮的通用区域。',
  tags: ['网络', 'settings'],
  sourceProject: 'fixture-library',
  sourceUiFile: 'widgets/network.ui',
  rootObjectName: 'panel',
  uiFragment: '<widget class="QFrame" name="panel"/>',
  structureSummary: 'QFrame with QFormLayout',
  screenshotPaths: ['preview.png'],
  widgetClasses: ['QFrame', 'QPushButton'],
  layoutTypes: ['QFormLayout'],
  qssDependencies: ['theme.qss'],
  qrcDependencies: ['icons.qrc'],
  customWidgets: [{ className: 'NetworkButton', header: 'widgets/network-button.h' }],
  connections: [],
  qtVersionRange: '>=5.9.6 <7.0.0',
};

describe('LocalComponentCapabilityAdapter', () => {
  it('maps component records to versioned UI fragment capabilities', () => {
    const capability = new LocalComponentCapabilityAdapter().fromRecord(component);
    expect(capability.kind).toBe('ui_fragment');
    expect(capability.dependencies.qrc).toEqual(component.qrcDependencies);
    expect(capability.dependencies.qss).toEqual(component.qssDependencies);
    expect(capability.dependencies.promotedWidgets).toContain('local.promoted.NetworkButton');
    expect(capability.source).toMatchObject({ type: 'local_library', path: component.sourceUiFile });
    expect(capability.designer.className).toBe('QFrame');
    expect(capability.qt).toMatchObject({ minVersion: '5.9.6', maxVersion: '7.0.0' });
  });

  it('maps search metadata and dependency state to a bounded candidate', () => {
    const candidate = new LocalComponentCapabilityAdapter().toCandidate({
      componentId: component.id,
      component,
      score: 55,
      reasons: ['text-exact'],
      missingDependencies: ['Missing QRC dependency icons.qrc'],
    });
    expect(candidate.capabilityId).toBe('local.ui_fragment.network-connection-panel');
    expect(candidate.dependencyStatus).toBe('degraded');
    expect(candidate.reasons).toContain('Missing QRC dependency icons.qrc');
  });

  it('keeps absolute paths inside the capability contract', () => {
    const record = { ...component, sourceUiFile: 'C:\\work\\widgets\\panel.ui' };
    const capability = new LocalComponentCapabilityAdapter().fromRecord(record);
    expect(capability.source.path).toBe('panel.ui');
  });
});

