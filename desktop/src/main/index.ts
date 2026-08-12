import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol, session } from 'electron';
import { RENDERER_SCHEME } from './environment.js';
import { registerIpcHandlers } from './ipc.js';
import { resolveRendererAsset } from './renderer-protocol.js';
import { createMainWindow } from './window.js';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function installSecurityPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('app://bundle/')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PRODUCTION_CSP],
      },
    });
  });
}

async function installRendererProtocol(): Promise<void> {
  const rendererRoot = path.join(app.getAppPath(), 'dist', 'renderer');
  await protocol.handle(RENDERER_SCHEME, (request) => {
    const assetPath = resolveRendererAsset(request.url, rendererRoot);
    if (!assetPath) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.marketinghub.desktop');
  installSecurityPolicy();
  await installRendererProtocol();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error: unknown) => {
  console.error('Desktop startup failed.', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
