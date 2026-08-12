import type { IpcMainInvokeEvent } from 'electron';
import { PRODUCTION_RENDERER_URL, getDevelopmentRendererUrl } from './environment.js';

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'app:') return `${url.protocol}//${url.host}`;
    return url.origin === 'null' ? null : url.origin;
  } catch {
    return null;
  }
}

export function isTrustedRendererUrl(value: string, isPackaged: boolean): boolean {
  const productionOrigin = normalizedOrigin(PRODUCTION_RENDERER_URL);
  const candidateOrigin = normalizedOrigin(value);
  if (!candidateOrigin) return false;
  if (candidateOrigin === productionOrigin) return true;

  const developmentUrl = isPackaged ? null : getDevelopmentRendererUrl();
  return developmentUrl !== null && candidateOrigin === normalizedOrigin(developmentUrl);
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent, isPackaged: boolean): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl, isPackaged)) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
}

export function parseExternalUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
