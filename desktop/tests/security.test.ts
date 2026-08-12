import { afterEach, describe, expect, it } from 'vitest';
import { isTrustedRendererUrl, parseExternalUrl } from '../src/main/security.js';

afterEach(() => {
  delete process.env.ELECTRON_RENDERER_URL;
});

describe('renderer trust boundary', () => {
  it('accepts only the packaged application origin by default', () => {
    expect(isTrustedRendererUrl('app://bundle/dashboard', true)).toBe(true);
    expect(isTrustedRendererUrl('app://attacker/dashboard', true)).toBe(false);
    expect(isTrustedRendererUrl('https://example.com', true)).toBe(false);
  });

  it('accepts the configured local development origin', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/projects', false)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5173/projects', false)).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/projects', true)).toBe(false);
  });
});

describe('external URL policy', () => {
  it('accepts ordinary HTTP(S) URLs without embedded credentials', () => {
    expect(parseExternalUrl('https://example.com/docs')?.hostname).toBe('example.com');
    expect(parseExternalUrl('http://example.com')).not.toBeNull();
  });

  it('rejects executable schemes, credentials, invalid values and oversized input', () => {
    expect(parseExternalUrl('file:///etc/passwd')).toBeNull();
    expect(parseExternalUrl('custom:payload')).toBeNull();
    expect(parseExternalUrl('https://user:secret@example.com')).toBeNull();
    expect(parseExternalUrl({})).toBeNull();
    expect(parseExternalUrl(`https://example.com/${'a'.repeat(2_100)}`)).toBeNull();
  });
});
