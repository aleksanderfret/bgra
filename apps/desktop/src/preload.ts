import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DesktopSetupState } from './desktop-api';

const api: DesktopApi = {
  getSetupState: (): Promise<DesktopSetupState> => ipcRenderer.invoke('desktop:get-setup-state'),
  saveDiagnostics: (): Promise<{ path: string }> => ipcRenderer.invoke('desktop:save-diagnostics'),
  markSetupComplete: (): Promise<DesktopSetupState> =>
    ipcRenderer.invoke('desktop:mark-setup-complete'),
  pullModels: (): Promise<{ ok: true }> => ipcRenderer.invoke('desktop:pull-models'),
};

contextBridge.exposeInMainWorld('bgaDesktop', api);
