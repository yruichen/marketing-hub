import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_BRIDGE_VERSION,
  IPC_CHANNELS,
  type DesktopAppInfo,
  type MarketingHubDesktopBridge,
} from '../shared/contract.js';

const bridge: MarketingHubDesktopBridge = Object.freeze({
  version: DESKTOP_BRIDGE_VERSION,
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo) as Promise<DesktopAppInfo>,
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url) as Promise<boolean>,
});

contextBridge.exposeInMainWorld('marketingHubDesktop', bridge);
