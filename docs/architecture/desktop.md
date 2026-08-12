# Desktop Architecture

## Status

Accepted baseline. The shell is intentionally small so the web product and the
desktop delivery channel can evolve at different speeds.

## System Context

```text
                         HTTPS + session/CSRF
┌──────────────────┐  ─────────────────────────▶  ┌──────────────────┐
│ Electron main    │                               │ Django API       │
│ lifecycle / OS   │                               │ source of truth  │
└────────┬─────────┘                               └──────────────────┘
         │ narrow, versioned IPC
┌────────▼─────────┐
│ sandboxed preload│
└────────┬─────────┘
         │ frozen window.marketingHubDesktop
┌────────▼─────────┐
│ React renderer   │  same product code as the web deployment
│ app://bundle     │
└──────────────────┘
```

The desktop application is a client, not a second backend deployment. Django,
PostgreSQL, Redis, Celery, AI provider access, tenancy, and billing remain
server concerns. This keeps database migrations, background execution, secrets,
and policy enforcement outside an auto-updated client binary.

## Directory and Ownership Model

```text
marketing-hub/
  backend/                 server and domain rules
  frontend/                browser-neutral React product
  desktop/
    src/main/              trusted Electron/OS layer
    src/preload/           capability bridge
    src/shared/            IPC names and data contracts
    scripts/               build/dev orchestration
    tests/                 host boundary tests
    resources/             public installer assets only
    dist/                  generated runnable input
    out/                   generated packages/installers
  docs/architecture/       current system design and ADRs
  docs/operations/         repeatable operational runbooks
```

No product domain logic belongs in `desktop/`. No module under `frontend/` may
import `electron`, Node built-ins, or files from `desktop/`. When the UI needs a
native capability, add a browser-neutral platform adapter under
`frontend/src/shared/platform/`, then implement its desktop side through the
preload bridge.

## Process Model and Trust Boundary

The main process is trusted and owns windows, protocols, OS integration, and IPC
handlers. The renderer is treated as untrusted even though its files are local.
The preload is a capability firewall, not a general-purpose RPC tunnel.

Non-negotiable invariants:

1. `nodeIntegration` stays disabled; `contextIsolation`, sandboxing, and web
   security stay enabled.
2. Production loads only packaged `app://bundle` resources. Environment
   variables cannot redirect a packaged build to remote renderer code.
3. Every IPC channel is namespaced and versioned, validates its sender and input,
   and returns serializable data. Never expose raw `ipcRenderer`.
4. Permissions are denied by default. A new permission needs a threat analysis,
   a focused allow rule, tests, and an ADR when it changes the trust model.
5. Navigation and new windows are denied by default. Only validated HTTP(S)
   URLs may leave the app through the system browser.
6. Local renderer files use a secure custom scheme, never privileged `file://`.
7. Electron fuses disable RunAsNode, Node options, and CLI inspection in packages
   and require the app to load from ASAR.

## Bridge Evolution

The current bridge is `v1`. A channel name includes its version, for example
`desktop:v1:app:get-info`. Additive response fields are allowed within a bridge
version. Renaming fields, changing meaning, or removing behavior requires a new
version and a migration window in which both versions can coexist.

Do not create a shared workspace package until renderer product code consumes a
desktop contract. At that point, extract browser-safe DTOs into a dedicated
`packages/desktop-contract` package rather than importing from `desktop/`.

## Data and Authentication

The packaged renderer has origin `app://bundle`. A production API serving the
desktop client must explicitly allow that CORS and CSRF origin. Because the API
is cross-site from a custom scheme, session and CSRF cookies must be `Secure`
and `SameSite=None`. The desktop app never receives provider keys or server
secrets.

The renderer build bakes in `VITE_API_BASE_URL`; release validation must reject
localhost and non-HTTPS production values. Runtime endpoint switching is a
future capability and must be signed/allow-listed rather than accepted from
arbitrary renderer input.

## Lifecycle Policy

- Keep Electron on a currently supported stable major; review security updates
  at least monthly and major upgrades at least once per release cycle.
- Upgrade Electron, Forge, and fuses in an isolated pull request with package,
  launch, auth, navigation, file-download, and installer smoke results.
- Prefer web APIs and pure TypeScript over native Node addons. A native addon
  adds ABI rebuild, notarization, and per-architecture test obligations.
- Main/preload changes require desktop-owner review. IPC or authentication
  changes also require frontend/backend owner review respectively.
- Keep the shell independently versioned. Product API compatibility must span at
  least the oldest supported desktop version or return an explicit upgrade error.

## Decisions

- [ADR-0001: Electron as a Separate Delivery Unit](./decisions/0001-electron-delivery-unit.md)
- Release and signing gates are defined in [Desktop Release Operations](../operations/desktop-release.md).
