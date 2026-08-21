/** Physical desktop bounds reported by the window manager. */
export interface WindowBounds { left: number; top: number; width: number; height: number; }
export interface PhysicalPoint { x: number; y: number; }
export interface DesktopPoint { x: number; y: number; }

export interface ScreenshotFrame {
  png: Buffer;
  width: number;
  height: number;
  /** Number of physical pixels per logical desktop pixel. */
  scaleFactor: number;
}

/** The small, testable seam around NutJS. It deliberately exposes no unrestricted shell APIs. */
export interface DesktopDriver {
  screenshot(bounds?: WindowBounds): Promise<ScreenshotFrame>;
  click(point: DesktopPoint): Promise<void>;
  key(keys: readonly string[]): Promise<void>;
  typeText(text: string): Promise<void>;
}

export type ScopedAction =
  | { type: 'click'; point: PhysicalPoint }
  | { type: 'key'; keys: readonly string[] }
  | { type: 'typeText'; text: string };

/** The subset of a UI-TARS ExecuteParams needed before an action reaches NutJS. */
export interface UiTarsPredictedAction {
  prediction: string;
  parsedPrediction: { action_type: string; action_inputs?: { start_box?: string; key?: string; hotkey?: string; content?: string } };
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
  factors: readonly [number, number];
}

export const MAX_ACTIONS = 20;
export const MAX_STEP_TIMEOUT_MS = 30_000;

const normalizeHotkey = (keys: readonly string[]): string => keys.map((part) => part.toUpperCase()).sort().join('+');
const dangerousHotkeys = new Set([
  ['ALT', 'F4'], ['ALT', 'TAB'], ['CTRL', 'ALT', 'DELETE'], ['CTRL', 'ESC'], ['META', 'D'], ['META', 'L'], ['META', 'R'], ['META', 'TAB'],
].map(normalizeHotkey));

/**
 * Converts a UI-TARS coordinate in a cropped physical screenshot to a logical
 * desktop coordinate. NutJS consumes logical coordinates on high-DPI Windows.
 */
export function translatePoint(point: PhysicalPoint, bounds: WindowBounds, scaleFactor: number): DesktopPoint {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) throw new Error('scaleFactor must be positive');
  return {
    x: bounds.left + point.x / scaleFactor,
    y: bounds.top + point.y / scaleFactor,
  };
}

function isInside(point: DesktopPoint, bounds: WindowBounds): boolean {
  return point.x >= bounds.left && point.y >= bounds.top
    && point.x < bounds.left + bounds.width && point.y < bounds.top + bounds.height;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('UI-TARS action aborted');
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`UI-TARS action timed out after ${timeoutMs}ms`)), timeoutMs);
    const onAbort = (): void => reject(new Error('UI-TARS action aborted'));
    signal?.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (result) => { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); resolve(result); },
      (error: unknown) => { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

/**
 * A hard security boundary around UI-TARS/NutJS: it only observes one target
 * window and can never send an out-of-window pointer event or a system hotkey.
 */
export class WindowScopedOperator {
  private actionCount = 0;

  constructor(private readonly bounds: WindowBounds, private readonly driver: DesktopDriver, private readonly stepTimeoutMs = MAX_STEP_TIMEOUT_MS) {
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('target window bounds must be positive');
    if (stepTimeoutMs <= 0 || stepTimeoutMs > MAX_STEP_TIMEOUT_MS) throw new Error(`step timeout must be between 1 and ${MAX_STEP_TIMEOUT_MS}ms`);
  }

  async screenshot(signal?: AbortSignal): Promise<ScreenshotFrame> {
    return withTimeout(this.driver.screenshot(this.bounds), this.stepTimeoutMs, signal);
  }

  async execute(action: ScopedAction | UiTarsPredictedAction, signal?: AbortSignal): Promise<void> {
    if ('parsedPrediction' in action) return this.executePrediction(action, signal);
    return this.executeScoped(action, signal);
  }

  private async executeScoped(action: ScopedAction, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.actionCount >= MAX_ACTIONS) throw new Error(`UI-TARS action limit of ${MAX_ACTIONS} reached`);
    this.actionCount += 1;
    if (action.type === 'click') {
      const desktopPoint = translatePoint(action.point, this.bounds, 1); // overridden by executePrediction for model coordinates
      if (!isInside(desktopPoint, this.bounds)) throw new Error('UI-TARS action is outside target window');
      await withTimeout(this.driver.click(desktopPoint), this.stepTimeoutMs, signal);
      return;
    }
    if (action.type === 'key') {
      const key = normalizeHotkey(action.keys);
      if (dangerousHotkeys.has(key)) throw new Error('UI-TARS action contains a dangerous hotkey');
      await withTimeout(this.driver.key(action.keys), this.stepTimeoutMs, signal);
      return;
    }
    if (action.text.length > 10_000) throw new Error('UI-TARS text action is too large');
    await withTimeout(this.driver.typeText(action.text), this.stepTimeoutMs, signal);
  }

  private async executePrediction(action: UiTarsPredictedAction, signal?: AbortSignal): Promise<void> {
    const type = action.parsedPrediction.action_type;
    const inputs = action.parsedPrediction.action_inputs ?? {};
    if (type === 'click' || type === 'left_click' || type === 'left_single') {
      const point = parsePredictionPoint(inputs.start_box ?? '');
      await this.executePredictedClick(point, action.scaleFactor, signal);
      return;
    }
    if (type === 'hotkey' || type === 'press' || type === 'release') return this.executeScoped({ type: 'key', keys: String(inputs.key ?? inputs.hotkey ?? '').split(/[+\s]+/).filter(Boolean) }, signal);
    if (type === 'type') return this.executeScoped({ type: 'typeText', text: String(inputs.content ?? '') }, signal);
    throw new Error(`UI-TARS action ${type} is not allowed by WindowScopedOperator`);
  }

  /** Executes model output after translating crop-relative physical coordinates. */
  async executePredictedClick(point: PhysicalPoint, scaleFactor: number, signal?: AbortSignal): Promise<DesktopPoint> {
    throwIfAborted(signal);
    if (this.actionCount >= MAX_ACTIONS) throw new Error(`UI-TARS action limit of ${MAX_ACTIONS} reached`);
    const desktopPoint = translatePoint(point, this.bounds, scaleFactor);
    if (!isInside(desktopPoint, this.bounds)) throw new Error('UI-TARS action is outside target window');
    this.actionCount += 1;
    await withTimeout(this.driver.click(desktopPoint), this.stepTimeoutMs, signal);
    return desktopPoint;
  }
}

function parsePredictionPoint(box: string): PhysicalPoint {
  const values = (box.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) throw new Error('UI-TARS action does not contain a valid target box');
  return values.length >= 4 ? { x: (values[0] + values[2]) / 2, y: (values[1] + values[3]) / 2 } : { x: values[0], y: values[1] };
}
