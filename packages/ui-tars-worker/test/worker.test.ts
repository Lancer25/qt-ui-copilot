import { describe, expect, it } from 'vitest';
import { UiTarsWorkerController, type GuidedNavigation, type WorkerEvent } from '../src/index.js';

describe('UiTarsWorkerController', () => {
  it('forwards bounded navigation progress and finishes without a model call', async () => {
    const events: WorkerEvent[] = [];
    const navigation: GuidedNavigation = {
      async run(_instruction, signal, onAction) { expect(signal.aborted).toBe(false); onAction('clicked settings'); },
    };
    const controller = new UiTarsWorkerController(navigation, (event) => events.push(event));
    controller.handle({ type: 'start', taskId: 'task-1', instruction: 'Open settings' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([
      { type: 'action', taskId: 'task-1', detail: 'clicked settings' },
      { type: 'finished', taskId: 'task-1' },
    ]);
  });
});
