# Desktop Release Operations

## Release Inputs

- Node.js 22 exactly and a clean `npm ci` in both `frontend/` and `desktop/`.
- A reviewed semver in `desktop/package.json`.
- `VITE_API_BASE_URL` set to the production HTTPS API; never localhost.
- Backend CORS and CSRF allow `app://bundle`.
- Production `SESSION_COOKIE_SAMESITE=None` and
  `CSRF_COOKIE_SAMESITE=None`, with both cookie `Secure` flags enabled.
- Reviewed Windows, macOS, and Linux application icons.
- Platform signing identities supplied by the CI secret store, never the repo.

## Required Checks

```bash
cd desktop
npm ci
npm run verify
npm run package
```

`npm run make` additionally enforces the production API URL gate before creating
a distributable.

Then smoke test the unpacked application on the target OS:

1. launch and single-instance behavior;
2. login, logout, CSRF-protected write, and session restart;
3. SPA deep links and back/forward navigation;
4. external links opening in the system browser;
5. permission prompts remaining denied unless explicitly supported;
6. API outage and upgrade-required failure states;
7. clean install, upgrade over the previous supported version, and uninstall.

## Platform Artifacts

Build macOS artifacts on macOS, Windows artifacts on Windows, and Linux artifacts
on Linux. The current Forge makers produce a macOS ZIP, Windows Squirrel output,
and Debian package. Do not publish unsigned artifacts as production releases.

Before the first public desktop release, add:

- Apple Developer ID signing, hardened runtime entitlements, and notarization;
- Windows Authenticode signing and timestamping;
- CI provenance/SBOM generation and checksum publication;
- a staged auto-update provider with signed metadata and rollback controls;
- platform-specific end-to-end smoke jobs.

Auto-update is deliberately absent from the baseline. Selecting an update
provider affects signing, privacy, rollback, channels, and incident response and
therefore requires a separate ADR.

## Upgrade Discipline

Electron ships frequent Chromium and Node updates. Dependabot may propose
patch/minor dependency updates weekly, but Electron major updates are reviewed
as dedicated changes. Never merge a runtime upgrade based only on compilation;
package and smoke all supported operating systems.

Support at least `current` and `current - 1` desktop versions at the API boundary.
If a security incident requires a forced upgrade, the API should return an
explicit machine-readable incompatibility response and the UI should explain
the required action.

## Rollback

Retain the prior signed installer and its checksums. A rollback restores the
previous desktop release channel entry; it must not roll back server data or
schema migrations. If the API has already removed compatibility, restore the API
compatibility layer before directing users to the older client.
