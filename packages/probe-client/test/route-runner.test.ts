import { describe, expect, it } from 'vitest';
import { RouteRunner, type ProbeTransport, type SemanticRoute } from '../src/index.js';

class FakeProbe implements ProbeTransport {
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  constructor(private readonly missing = false) {}
  async request<T>(request: { method: string; params?: Record<string, unknown> }): Promise<T> {
    this.calls.push(request);
    if (this.missing && request.method === 'waitForWidget') throw new Error('dialog did not appear');
    return {} as T;
  }
}

const route: SemanticRoute = {
  id: 'open-network-settings', targetUi: 'ui/NetworkSettings.ui', steps: [
    { kind: 'invoke', objectName: 'settingsButton' },
    { kind: 'waitForWidget', objectName: 'settingsDialog', timeoutMs: 10 },
    { kind: 'selectTab', objectName: 'settingsTabs', text: 'Network' },
    { kind: 'waitForUi', objectName: 'networkSettingsDialog', timeoutMs: 10 },
  ],
};

describe('RouteRunner', () => {
  it('runs typed semantic actions and requires waitForUi for success', async () => {
    const probe = new FakeProbe();
    const result = await new RouteRunner(probe, 'token').run(route);
    expect(result).toEqual(expect.objectContaining({ status: 'arrived', uiValidationStarted: true }));
    expect(probe.calls.map((call) => call.method)).toEqual(['invokeButton', 'waitForWidget', 'selectTab', 'waitForUi']);
  });

  it('does not blame a ui patch when navigation fails', async () => {
    const result = await new RouteRunner(new FakeProbe(true), 'token').run(route);
    expect(result).toMatchObject({ status: 'navigation_failed', uiValidationStarted: false, failedStep: 1 });
  });

  it('rejects a route without final page confirmation', async () => {
    const result = await new RouteRunner(new FakeProbe(), 'token').run({ ...route, steps: route.steps.slice(0, -1) });
    expect(result).toMatchObject({ status: 'navigation_failed', uiValidationStarted: false });
  });
});
