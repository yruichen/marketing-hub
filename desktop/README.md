# Marketing Hub Desktop

This directory is the Electron delivery unit for Marketing Hub. It hosts the
existing React application; it does not duplicate product features or embed the
Django runtime.

## Commands

Use Node.js 22 exactly (the build scripts reject other majors) and start the
Django API separately.

```bash
npm ci
npm run dev
```

`npm run dev` starts the frontend Vite server, watches the main and preload
bundles, and restarts Electron when host code changes.

```bash
npm run verify   # types, unit tests, host build, and renderer build
npm run package  # unpacked application for the current OS
npm run make     # distributable for the current OS
```

The production renderer build uses `frontend/.env.production` or the
`VITE_API_BASE_URL` environment variable. It must point to the deployed HTTPS
API before a release is built. `npm run make` rejects missing, local, or
non-HTTPS endpoints; `npm run package` remains available for local package
smoke tests.

## Boundaries

- `src/main/` owns operating-system capabilities and Electron lifecycle.
- `src/preload/` owns the narrow, versioned renderer bridge.
- `src/shared/` contains bridge contracts shared by main and preload only.
- `tests/` verifies trust boundaries without launching a GUI.
- `scripts/` contains deterministic build and development orchestration.
- `dist/` and `out/` are generated and must never be edited or committed.
- Product UI remains in `frontend/src/`; desktop-specific UI must enter through
  a small platform adapter there, never by importing Electron.

Read [Desktop Architecture](../docs/architecture/desktop.md) before adding an
IPC channel or native dependency. Read [Desktop Release Operations](../docs/operations/desktop-release.md)
before producing a distributable.
