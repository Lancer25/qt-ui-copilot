export interface ProbeActionRequest {
  id: string;
  token: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ProbeTransport {
  request<T = unknown>(request: ProbeActionRequest, timeoutMs?: number): Promise<T>;
}

export type SemanticRouteStep =
  | { kind: 'activateWindow'; objectName: string }
  | { kind: 'resizeWindow'; objectName: string; width: number; height: number }
  | { kind: 'invoke'; objectName: string }
  | { kind: 'triggerAction'; objectName: string }
  | { kind: 'selectTab'; objectName: string; index?: number; text?: string }
  | { kind: 'selectComboItem'; objectName: string; index?: number; text?: string }
  | { kind: 'setLineEditText'; objectName: string; text: string }
  | { kind: 'setCheckState'; objectName: string; checked: boolean }
  | { kind: 'waitForWidget'; objectName: string; timeoutMs?: number }
  | { kind: 'waitForUi'; objectName: string; timeoutMs?: number };

export interface SemanticRoute {
  id: string;
  targetUi: string;
  steps: SemanticRouteStep[];
}

export type RouteResult =
  | { status: 'arrived'; uiValidationStarted: true; completedSteps: number }
  | { status: 'navigation_failed'; uiValidationStarted: false; completedSteps: number; failedStep?: number; error: string };

const methodFor: Record<SemanticRouteStep['kind'], string> = {
  activateWindow: 'activateWindow', resizeWindow: 'resizeWindow', invoke: 'invokeButton', triggerAction: 'triggerAction',
  selectTab: 'selectTab', selectComboItem: 'selectComboItem', setLineEditText: 'setLineEditText', setCheckState: 'setCheckState',
  waitForWidget: 'waitForWidget', waitForUi: 'waitForUi',
};

function paramsFor(step: SemanticRouteStep): Record<string, unknown> {
  const { kind: _kind, timeoutMs: _timeoutMs, ...params } = step as SemanticRouteStep & { timeoutMs?: number };
  return params;
}

/** Replays only Probe's fixed semantic allowlist; successful navigation ends at a verified UI step. */
export class RouteRunner {
  constructor(private readonly probe: ProbeTransport, private readonly token: string) {}

  async run(route: SemanticRoute): Promise<RouteResult> {
    let completedSteps = 0;
    let confirmed = false;
    for (let index = 0; index < route.steps.length; index += 1) {
      const step = route.steps[index];
      try {
        await this.probe.request({
          id: `${route.id}-${index}`,
          token: this.token,
          method: methodFor[step.kind],
          params: paramsFor(step),
        }, step.kind === 'waitForWidget' || step.kind === 'waitForUi' ? step.timeoutMs : undefined);
      } catch (error) {
        return { status: 'navigation_failed', uiValidationStarted: false, completedSteps, failedStep: index, error: error instanceof Error ? error.message : String(error) };
      }
      completedSteps += 1;
      if (step.kind === 'waitForUi') confirmed = true;
    }
    if (!confirmed) return { status: 'navigation_failed', uiValidationStarted: false, completedSteps, error: 'Route did not end with a waitForUi confirmation' };
    return { status: 'arrived', uiValidationStarted: true, completedSteps };
  }
}
