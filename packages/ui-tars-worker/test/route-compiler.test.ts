import { describe, expect, it } from 'vitest';
import { compileVisualTraceToRoute, type ProbeHitTester } from '../src/index.js';

describe('compileVisualTraceToRoute', () => {
  it('turns a clicked button into a stable semantic invoke step', async () => {
    const probe: ProbeHitTester = { async hitTest() { return { objectName: 'settingsButton', className: 'QPushButton', path: ['mainWindow', 'settingsButton'] }; } };
    const route = await compileVisualTraceToRoute('open-settings', 'Settings.ui', [{ action: { type: 'click', point: { x: 30, y: 50 } } }], probe);
    expect(route.steps).toEqual([{ kind: 'invoke', objectName: 'settingsButton' }]);
  });

  it('retains an image-guided trace when the probe cannot identify a stable widget', async () => {
    const probe: ProbeHitTester = { async hitTest() { return undefined; } };
    const route = await compileVisualTraceToRoute('fallback', 'Settings.ui', [{ action: { type: 'click', point: { x: 30, y: 50 } }, screenshot: 'before.png' }], probe);
    expect(route.steps[0]).toMatchObject({ kind: 'imageGuided', screenshot: 'before.png' });
  });
});
