import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { RENDERER_HOST, RENDERER_SCHEME } from './environment.js';

export function resolveRendererAsset(requestUrl: string, rendererRoot: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${RENDERER_SCHEME}:` || url.hostname !== RENDERER_HOST) return null;

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }

  const root = path.resolve(rendererRoot);
  const requestedPath = path.resolve(root, relativePath || 'index.html');
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) return null;

  if (existsSync(requestedPath) && statSync(requestedPath).isFile()) return requestedPath;
  if (path.extname(relativePath)) return null;
  return path.join(root, 'index.html');
}
