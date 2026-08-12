export const RENDERER_SCHEME = 'app';
export const RENDERER_HOST = 'bundle';
export const PRODUCTION_RENDERER_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/`;

export function getDevelopmentRendererUrl(): string | null {
  const value = process.env.ELECTRON_RENDERER_URL?.trim();
  if (!value) return null;

  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('ELECTRON_RENDERER_URL must be a local HTTP URL.');
  }
  return url.toString();
}

export function getRendererUrl(isPackaged: boolean): string {
  if (isPackaged) return PRODUCTION_RENDERER_URL;
  return getDevelopmentRendererUrl() ?? PRODUCTION_RENDERER_URL;
}
