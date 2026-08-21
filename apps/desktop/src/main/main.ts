import { app, BrowserWindow, ipcMain } from 'electron';
import { resolveMainWindowLoadTarget, resolvePreloadEntryPath } from './window-loading';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

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
