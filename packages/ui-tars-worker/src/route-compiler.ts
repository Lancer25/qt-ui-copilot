import type { SemanticRouteStep } from '@qt-ui-copilot/probe-client';
import type { DesktopPoint, ScopedAction } from './window-scoped-operator.js';

export interface ProbeHit { objectName: string; className: string; path: string[]; }
export interface ProbeHitTester { hitTest(point: DesktopPoint): Promise<ProbeHit | undefined>; }
export interface VisualTraceEntry { action: ScopedAction; desktopPoint?: DesktopPoint; screenshot?: string; }
export type ImageGuidedStep = { kind: 'imageGuided'; action: ScopedAction; screenshot?: string };
export interface CompiledRoute { id: string; targetUi: string; steps: Array<SemanticRouteStep | ImageGuidedStep>; }

function toSemanticStep(action: ScopedAction, hit?: ProbeHit): SemanticRouteStep | undefined {
  if (!hit?.objectName) return undefined;
  if (action.type === 'click') {
    if (hit.className === 'QTabBar' || hit.className === 'QTabWidget') return { kind: 'selectTab', objectName: hit.objectName };
    if (hit.className === 'QComboBox') return { kind: 'selectComboItem', objectName: hit.objectName };
    if (hit.className === 'QCheckBox' || hit.className === 'QRadioButton') return { kind: 'setCheckState', objectName: hit.objectName, checked: true };
    if (hit.className === 'QAction') return { kind: 'triggerAction', objectName: hit.objectName };
    return { kind: 'invoke', objectName: hit.objectName };
  }
  return undefined;
}

/** Turns verified visual exploration into a replayable Probe-only route when possible. */
export async function compileVisualTraceToRoute(
  id: string,
  targetUi: string,
  trace: readonly VisualTraceEntry[],
  probe: ProbeHitTester,
): Promise<CompiledRoute> {
  const steps: CompiledRoute['steps'] = [];
  for (const entry of trace) {
    // Older visual traces did not persist a separately transformed point. In
    // that case their point is already the desktop point captured after action.
    const point = entry.desktopPoint ?? (entry.action.type === 'click' ? entry.action.point : undefined);
    const hit = point ? await probe.hitTest(point) : undefined;
    const semantic = toSemanticStep(entry.action, hit);
    steps.push(semantic ?? { kind: 'imageGuided', action: entry.action, screenshot: entry.screenshot });
  }
  return { id, targetUi, steps };
}
