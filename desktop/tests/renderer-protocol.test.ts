import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRendererAsset } from '../src/main/renderer-protocol.js';

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'marketing-hub-desktop-'));
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'index.html'), '<html></html>');
  writeFileSync(path.join(root, 'assets', 'app.js'), 'export {};');
  return root;
}

describe('renderer protocol resolution', () => {
  it('serves known files and falls back to the SPA entry for routes', () => {
    const root = fixture();
    expect(resolveRendererAsset('app://bundle/assets/app.js', root)).toBe(path.join(root, 'assets', 'app.js'));
    expect(resolveRendererAsset('app://bundle/projects/42', root)).toBe(path.join(root, 'index.html'));
  });

  it('rejects unknown assets, other origins and traversal attempts', () => {
    const root = fixture();
    expect(resolveRendererAsset('app://bundle/assets/missing.js', root)).toBeNull();
    expect(resolveRendererAsset('app://other/index.html', root)).toBeNull();
    expect(resolveRendererAsset('app://bundle/%2e%2e/secret.txt', root)).toBeNull();
  });
});
