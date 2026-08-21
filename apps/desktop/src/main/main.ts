import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

const createWindow = (): BrowserWindow => new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 960,
  minHeight: 640,
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});

app.whenReady().then(() => {
  ipcMain.handle('desktop:getAppVersion', () => app.getVersion());

  const window = createWindow();
  void window.loadURL('data:text/html,<main><h1>Qt UI Copilot</h1></main>');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
