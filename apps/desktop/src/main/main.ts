import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import { join, resolve } from 'node:path';
import { resolveMainWindowLoadTarget, resolvePreloadEntryPath } from './window-loading';
import { createLocalBackend, registerIpc } from './ipc/register-ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export type UiTarsUtilityCommand =
  | { type: 'start'; taskId: string; instruction: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' };

export type UiTarsUtilityEvent =
  | { type: 'action'; taskId: string; detail: string; eventId: string }
  | { type: 'finished'; taskId: string; eventId: string }
  | { type: 'failed'; taskId?: string; error: string; eventId: string };

/**
 * Runs UI-TARS outside the BrowserWindow and Main process. The worker location
 * is passed explicitly so packaging can place the native-dependent code outside
 * ASAR; Task 12 wires that stable production path.
 */
export class UiTarsUtilityController {
  private process?: UtilityProcess;

  constructor(private readonly workerEntrypoint: string, private readonly onEvent: (event: UiTarsUtilityEvent) => void) {}

  start(command: Extract<UiTarsUtilityCommand, { type: 'start' }>): void {
    if (this.process) throw new Error('UI-TARS utility process is already running');
    const child = utilityProcess.fork(this.workerEntrypoint, [], { stdio: 'pipe', serviceName: 'qt-ui-copilot-ui-tars' });
    this.process = child;
    child.on('message', (event: UiTarsUtilityEvent) => this.onEvent(event));
    child.once('exit', () => { if (this.process === child) this.process = undefined; });
    child.postMessage(command);
  }

  send(command: Exclude<UiTarsUtilityCommand, { type: 'start' }>): void {
    if (!this.process) throw new Error('UI-TARS utility process is not running');
    this.process.postMessage(command);
  }

  stop(): void {
    if (!this.process) return;
    this.process.postMessage({ type: 'stop' });
    this.process.kill();
    this.process = undefined;
  }
}

export function defaultUiTarsWorkerEntrypoint(appRoot: string): string {
  return resolve(appRoot, 'ui-tars-worker', 'worker.js');
}

const createWindow = (): BrowserWindow => new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 960,
  minHeight: 640,
  webPreferences: {
    preload: resolvePreloadEntryPath(__dirname),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});

app.whenReady().then(() => {
  ipcMain.handle('desktop:getAppVersion', () => app.getVersion());

  const window = createWindow();
  registerIpc(window, createLocalBackend({ databasePath: join(app.getPath('userData'), 'qt-ui-copilot.sqlite') }));
  const target = resolveMainWindowLoadTarget(
    MAIN_WINDOW_VITE_DEV_SERVER_URL,
    MAIN_WINDOW_VITE_NAME,
    __dirname,
  );
  void (target.kind === 'url' ? window.loadURL(target.value) : window.loadFile(target.value));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
