import { app, BrowserWindow, ipcMain, Menu, safeStorage, utilityProcess, type UtilityProcess } from 'electron';
import { join, resolve } from 'node:path';
import { resolveMainWindowLoadTarget, resolvePreloadEntryPath } from './window-loading';
import { createLocalBackend, registerIpc } from './ipc/register-ipc';
import { registerV3Ipc } from './ipc/register-v3-ipc';
import { verifyRuntimeAssets } from './runtime-assets';

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
  minWidth: 1100,
  minHeight: 640,
  frame: false,
  titleBarStyle: 'hidden',
  webPreferences: {
    preload: resolvePreloadEntryPath(__dirname),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});

app.whenReady().then(async () => {
  // The product shell owns navigation; the default Electron menu duplicates
  // those actions and breaks the compact workbench layout.
  Menu.setApplicationMenu(null);
  // A packaged application must never silently use incomplete/tampered native
  // helper sources. Development builds intentionally build these per Qt kit.
  if (app.isPackaged) await verifyRuntimeAssets(join(process.resourcesPath, 'qt-ui-copilot-assets'));
  ipcMain.handle('desktop:getAppVersion', () => app.getVersion());
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:toggleMaximize', (event) => { const window = BrowserWindow.fromWebContents(event.sender); if (!window) return false; if (window.isMaximized()) window.unmaximize(); else window.maximize(); return window.isMaximized(); });
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  const window = createWindow();
  const backend = createLocalBackend({
    databasePath: join(app.getPath('userData'), 'qt-ui-copilot.sqlite'),
    secureStorage: safeStorage,
  });
  registerIpc(window, backend);
  const v3Ipc = registerV3Ipc(window, undefined, undefined, backend.createModelProvider?.());
  app.once('before-quit', () => { v3Ipc.dispose(); backend.dispose?.(); });
  const target = resolveMainWindowLoadTarget(
    MAIN_WINDOW_VITE_DEV_SERVER_URL,
    MAIN_WINDOW_VITE_NAME,
    __dirname,
  );
  const v2Target = process.env.QT_UI_COPILOT_V2 === '1';
  void (target.kind === 'url' ? window.loadURL(v2Target ? `${target.value}#v2` : target.value) : window.loadFile(target.value, v2Target ? { hash: 'v2' } : undefined));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
