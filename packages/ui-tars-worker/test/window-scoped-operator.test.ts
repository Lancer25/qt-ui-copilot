import { describe, expect, it } from 'vitest';
import { WindowScopedOperator, translatePoint, type DesktopDriver } from '../src/index.js';

const bounds = { left: 100, top: 50, width: 800, height: 600 };

describe('WindowScopedOperator', () => {
  it('translates crop-relative physical coordinates into desktop logical coordinates', () => {
    expect(translatePoint({ x: 400, y: 200 }, bounds, 1.25)).toEqual({ x: 420, y: 210 });
  });

  it('blocks an action outside the target window', async () => {
    const operator = new WindowScopedOperator(bounds, fakeDriver());
    await expect(operator.execute({
      prediction: "click(start_box='(900,700)')",
      parsedPrediction: { action_type: 'click', action_inputs: { start_box: '(900,700)' } },
      screenWidth: 800, screenHeight: 600, scaleFactor: 1, factors: [1, 1],
    })).rejects.toThrow('outside target window');
  });

  it('rejects dangerous system hotkeys and respects abort signals', async () => {
    const operator = new WindowScopedOperator(bounds, fakeDriver());
    await expect(operator.execute({ type: 'key', keys: ['ALT', 'F4'] })).rejects.toThrow('dangerous hotkey');
    const controller = new AbortController(); controller.abort();
    await expect(operator.execute({ type: 'click', point: { x: 20, y: 20 } }, controller.signal)).rejects.toThrow('aborted');
  });
});

function fakeDriver(): DesktopDriver {
  return {
    async screenshot() { return { png: Buffer.from('image'), width: 1000, height: 800, scaleFactor: 1 }; },
    async click() {}, async key() {}, async typeText() {},
  };
}
