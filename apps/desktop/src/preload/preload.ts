import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DesktopSetupState, RuntimeProgress } from '../ipc/desktop-api';

const api: DesktopApi = {
  platform:
    process.platform === 'win32' || process.platform === 'linux' ? process.platform : 'darwin',
  getSetupState: (): Promise<DesktopSetupState> => ipcRenderer.invoke('desktop:get-setup-state'),
  saveDiagnostics: (): Promise<{ path: string }> => ipcRenderer.invoke('desktop:save-diagnostics'),
  markSetupComplete: (): Promise<DesktopSetupState> =>
    ipcRenderer.invoke('desktop:mark-setup-complete'),
  ensureRuntime: (): Promise<{ ok: true }> => ipcRenderer.invoke('desktop:ensure-runtime'),
  openExternalHttps: (url: string): Promise<void> =>
    ipcRenderer.invoke('desktop:open-external-https', url),
  pullModels: (): Promise<{ ok: true }> => ipcRenderer.invoke('desktop:pull-models'),
  getUninstallPreview: () => ipcRenderer.invoke('desktop:get-uninstall-preview'),
  runUninstall: (selection) => ipcRenderer.invoke('desktop:run-uninstall', selection),
  onRuntimeProgress: (handler: (event: RuntimeProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RuntimeProgress): void => {
      handler(payload);
    };
    ipcRenderer.on('desktop:runtime-progress', listener);
    return () => {
      ipcRenderer.removeListener('desktop:runtime-progress', listener);
    };
  },
};

contextBridge.exposeInMainWorld('bgaDesktop', api);
