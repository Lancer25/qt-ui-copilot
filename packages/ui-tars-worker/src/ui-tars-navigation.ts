import { GUIAgent } from '@ui-tars/sdk';
import { Operator, StatusEnum, UITarsModel, parseBoxToScreenCoords, type ExecuteParams, type ExecuteOutput, type ScreenshotOutput, type UITarsModelConfig } from '@ui-tars/sdk/core';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { WindowScopedOperator, type WindowBounds } from './window-scoped-operator.js';
import type { GuidedNavigation } from './worker.js';

/** A bounded replacement for UI-TARS' full-desktop NutJSOperator. */
export class ScopedUiTarsOperator extends Operator {
  static readonly MANUAL = NutJSOperator.MANUAL;
  constructor(private readonly scoped: WindowScopedOperator) { super(); }

  async screenshot(): Promise<ScreenshotOutput> {
    const frame = await this.scoped.screenshot();
    return { base64: frame.png.toString('base64'), scaleFactor: frame.scaleFactor };
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const action = params.parsedPrediction.action_type;
    const inputs = params.parsedPrediction.action_inputs ?? {};
    if (action === 'finished' || action === 'call_user' || action === 'user_stop') return { status: StatusEnum.END };
    if (action === 'click' || action === 'left_click' || action === 'left_single') {
      const point = parseBoxToScreenCoords({ boxStr: String(inputs.start_box ?? ''), screenWidth: params.screenWidth, screenHeight: params.screenHeight });
      if (point.x === null || point.y === null) throw new Error('UI-TARS click does not contain a valid target box');
      await this.scoped.executePredictedClick(point, params.scaleFactor);
      return { status: StatusEnum.RUNNING };
    }
    if (action === 'type') { await this.scoped.execute({ type: 'typeText', text: String(inputs.content ?? '') }); return { status: StatusEnum.RUNNING }; }
    if (action === 'hotkey' || action === 'press' || action === 'release') {
      const key = String(inputs.key ?? inputs.hotkey ?? '');
      await this.scoped.execute({ type: 'key', keys: key.split(/[+\s]+/).filter(Boolean) });
      return { status: StatusEnum.RUNNING };
    }
    // Explicitly reject unsupported pointer/scroll/drag actions instead of
    // allowing the SDK's unbounded NutJS operator to act on the desktop.
    throw new Error(`UI-TARS action ${action} is not allowed by WindowScopedOperator`);
  }
}

export interface UiTarsNavigationOptions { bounds: WindowBounds; operator: WindowScopedOperator; model: UITarsModelConfig; }

/** Creates the real SDK agent only in the isolated worker; callers inject model credentials at runtime. */
export function createUiTarsNavigation(options: UiTarsNavigationOptions): GuidedNavigation & { pause(): void; resume(): void; stop(): void } {
  const agent = new GUIAgent({
    operator: new ScopedUiTarsOperator(options.operator),
    model: new UITarsModel(options.model),
    maxLoopCount: 20,
    retry: { model: { maxRetries: 0 }, screenshot: { maxRetries: 0 }, execute: { maxRetries: 0 } },
  });
  return {
    async run(instruction, signal, onAction) {
      if (signal.aborted) throw new Error('UI-TARS action aborted');
      signal.addEventListener('abort', () => agent.stop(), { once: true });
      await agent.run(instruction);
      onAction(`UI-TARS completed bounded navigation in ${options.bounds.width}×${options.bounds.height} target window`);
    },
    pause: () => agent.pause(), resume: () => agent.resume(), stop: () => agent.stop(),
  };
}
