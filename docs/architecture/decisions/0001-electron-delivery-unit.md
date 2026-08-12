# ADR-0001: Electron as a Separate Delivery Unit

- Status: Accepted
- Date: 2026-08-12
- Owners: Desktop maintainers

## Context

Marketing Hub already has an independently buildable Django service and React
SPA. The desktop channel needs native lifecycle and distribution capabilities
without coupling product development to Electron or turning the client into a
second server stack.

## Decision

Add `desktop/` as a sibling delivery unit. It packages the existing frontend
output, connects to the existing API, and exposes only versioned capabilities
through a sandboxed preload. Use Electron Forge for OS packaging and esbuild only
for the main/preload host bundles.

The application uses a secure `app://bundle` protocol in production. It does not
load a hosted production UI and does not embed Python, a database, Redis, Celery,
or AI provider credentials.

## Consequences

- Web releases and desktop releases can use different cadences.
- Product UI has one implementation and remains browser-compatible.
- The backend must support the desktop origin and cross-site cookie policy.
- Offline server-backed product behavior is not provided by the shell.
- Native capabilities require explicit IPC design and owner review.
- Each OS must build and sign its own artifact; cross-compilation is not the
  release source of truth.

## Revisit When

Revisit this decision only if offline-first requirements demand a local data
model, enterprise policy requires a hosted renderer, or runtime endpoint
selection becomes a supported product feature. Each case needs its own threat
model and migration plan.
