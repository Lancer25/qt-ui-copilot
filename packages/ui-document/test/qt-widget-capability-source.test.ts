import { describe, expect, it } from 'vitest';
import { QtWidgetCapabilitySource } from '../src/qt-widget-capability-source';

describe('QtWidgetCapabilitySource', () => {
  const source = new QtWidgetCapabilitySource();

  it('publishes deterministic, schema-valid Qt Widgets capabilities', () => {
    const capabilities = source.list();
    expect(capabilities.length).toBeGreaterThan(40);
    expect(capabilities.map((item) => item.id)).toEqual([...capabilities.map((item) => item.id)].sort());
    expect(capabilities.find((item) => item.designer.className === 'QMainWindow')?.designer.container).toBe(true);
    expect(capabilities.find((item) => item.designer.className === 'QPushButton')?.designer.container).toBe(false);
  });

  it('filters by Qt version and required modules', () => {
    const qt59 = source.forKit({ version: '5.9.6', modules: ['Widgets'] });
    expect(qt59.some((item) => item.designer.className === 'QStatusBar')).toBe(true);
    expect(qt59.some((item) => item.qt.minVersion === '6.0.0')).toBe(false);
    expect(source.forKit({ version: '5.9.6', modules: [] })).toHaveLength(0);
    expect(source.forKit({ version: '6.10.2', modules: ['Widgets'] }).every((item) => item.qt.modules.every((module) => ['Widgets'].includes(module)))).toBe(true);
  });

  it('does not share mutable records between callers', () => {
    const first = source.list();
    first[0].tags.push('caller-mutated');
    expect(source.list()[0].tags).not.toContain('caller-mutated');
  });
});
