import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopApi {
  getAppVersion(): Promise<string>;
}

const desktopApi: DesktopApi = {
  getAppVersion: () => ipcRenderer.invoke('desktop:getAppVersion') as Promise<string>,
};

contextBridge.exposeInMainWorld('qtUiCopilot', desktopApi);

declare global {
  interface Window {
    qtUiCopilot: DesktopApi;
  }
}
