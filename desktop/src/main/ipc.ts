import { app, ipcMain, shell } from 'electron';
import { DESKTOP_BRIDGE_VERSION, IPC_CHANNELS, type DesktopAppInfo } from '../shared/contract.js';
import { assertTrustedIpcSender, parseExternalUrl } from './security.js';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event): DesktopAppInfo => {
    assertTrustedIpcSender(event, app.isPackaged);
    return {
      bridgeVersion: DESKTOP_BRIDGE_VERSION,
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
    };
  });

  ipcMain.handle(IPC_CHANNELS.openExternal, async (event, rawUrl: unknown): Promise<boolean> => {
    assertTrustedIpcSender(event, app.isPackaged);
    const url = parseExternalUrl(rawUrl);
    if (!url) return false;
    await shell.openExternal(url.toString());
    return true;
  });
}
