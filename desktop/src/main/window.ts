import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, shell } from 'electron';
import { getRendererUrl } from './environment.js';
import { isTrustedRendererUrl, parseExternalUrl } from './security.js';

function handleExternalNavigation(rawUrl: string): void {
  const url = parseExternalUrl(rawUrl);
  if (url) void shell.openExternal(url.toString());
}

export function createMainWindow(): BrowserWindow {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const window = new BrowserWindow({
    title: 'Marketing Hub',
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f6f0e5',
    webPreferences: {
      preload: path.join(currentDirectory, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedRendererUrl(url, app.isPackaged)) {
      void window.loadURL(url);
    } else {
      handleExternalNavigation(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, app.isPackaged)) return;
    event.preventDefault();
    handleExternalNavigation(url);
  });

  void window.loadURL(getRendererUrl(app.isPackaged));
  return window;
}
