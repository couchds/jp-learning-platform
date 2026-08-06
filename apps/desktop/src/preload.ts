import { contextBridge, ipcRenderer } from "electron";
import type { ManagedServiceState } from "./serviceSupervisor.js";

export type DesktopRuntime = {
  apiUrl: string;
  apiToken: string;
  version: string;
  platform: NodeJS.Platform;
  isDesktop: true;
};

const desktopApi = Object.freeze({
  getRuntime: () => ipcRenderer.invoke("desktop:get-runtime") as Promise<DesktopRuntime>,
  getServices: () => ipcRenderer.invoke("desktop:get-services") as Promise<ManagedServiceState[]>,
  restartServices: () => ipcRenderer.invoke("desktop:restart-services") as Promise<ManagedServiceState[]>,
  capture: () => ipcRenderer.invoke("desktop:capture") as Promise<{ ok: boolean; error?: string }>,
  openDataFolder: () => ipcRenderer.invoke("desktop:open-data-folder") as Promise<void>,
  onServicesChanged: (listener: (states: ManagedServiceState[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, states: ManagedServiceState[]) => listener(states);
    ipcRenderer.on("desktop:services-changed", wrapped);
    return () => ipcRenderer.removeListener("desktop:services-changed", wrapped);
  }
});

contextBridge.exposeInMainWorld("yomunamiDesktop", desktopApi);
