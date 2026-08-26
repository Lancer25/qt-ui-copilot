import { UiCapabilitySchema, type UiCapability } from '@qt-ui-copilot/contracts';
import {
  QT_CONTAINER_CLASSES,
  QT_WIDGET_CLASSES,
  QT_WIDGET_FALLBACKS,
} from './qt-widget-catalog.js';

/** The subset of a project Qt Kit needed to select built-in capabilities. */
export interface QtCapabilityKit {
  id?: string;
  version: string;
  modules: string[];
}

function versionParts(version: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = version.split('.');
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function capabilityFor(className: string): UiCapability {
  const fallbackClass = QT_WIDGET_FALLBACKS[className];
  return UiCapabilitySchema.parse({
    id: `qt.widgets.${className}`,
    kind: 'qt_widget',
    displayName: className,
    description: `Qt Widgets 控件 ${className}`,
    tags: ['qt', 'widgets', className.replace(/^Q/, '').toLowerCase()],
    qt: {
      // Qt 5.9.6 is the product's compatibility floor. These are all from
      // the Qt Widgets module and therefore remain usable by Qt 6 kits.
      minVersion: '5.9.6',
      modules: ['Widgets'],
      verifiedKitIds: [],
    },
    designer: {
      className,
      container: QT_CONTAINER_CLASSES.has(className),
    },
    dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
    fallback: fallbackClass ? {
      capabilityId: `qt.widgets.${fallbackClass}`,
      reason: `控件 ${className} 不可用时使用 ${fallbackClass}`,
    } : undefined,
    source: { type: 'builtin', adapterId: 'qt-widgets' },
  });
}

/**
 * Built-in, version-aware source for concrete Qt Designer Widgets classes.
 * Optional Qt modules are deliberately not included: this source represents
 * the portable Widgets baseline and never assumes Charts/WebEngine/etc.
 */
export class QtWidgetCapabilitySource {
  private readonly capabilities: UiCapability[];

  constructor() {
    this.capabilities = [...QT_WIDGET_CLASSES]
      // Use code-point ordering so the registry is identical across locales.
      .sort()
      .map(capabilityFor);
  }

  list(): UiCapability[] {
    return this.capabilities.map((capability) => structuredClone(capability));
  }

  forKit(kit: QtCapabilityKit): UiCapability[] {
    const availableModules = new Set(kit.modules);
    return this.capabilities
      .filter((capability) => {
        const { minVersion, maxVersion, modules } = capability.qt;
        if (compareVersions(kit.version, minVersion) < 0) return false;
        if (maxVersion && compareVersions(kit.version, maxVersion) > 0) return false;
        return modules.every((module) => availableModules.has(module));
      })
      .map((capability) => structuredClone(capability));
  }
}
