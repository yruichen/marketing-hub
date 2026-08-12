# Contributing to Marketing Hub

Thanks for helping improve Marketing Hub. The project is under active development, so small, focused pull requests are the easiest to review and ship.

## Before You Start

- Search existing issues before opening a new one.
- Use an issue for bugs, feature proposals, and behavior changes.
- For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.
- Keep each pull request focused on one outcome.

## Development Setup

### Full stack

```bash
docker compose up
```

### Backend

Requires Python 3.12 and `uv`.

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

### Frontend

Requires Node.js 22 and npm.

```bash
cd frontend
npm ci
npm run dev
```

### Desktop

Requires the frontend dependencies to be installed and the Django API to be
running. In another terminal:

```bash
cd desktop
npm ci
npm run dev
```

## Branches and Commits

Create a branch from `main` using one of these prefixes:

- `feat/` for a user-facing capability
- `fix/` for a defect
- `docs/` for documentation
- `refactor/` for structural work
- `chore/` for maintenance

Use concise, imperative commit messages. Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:` are preferred.

## Pull Request Checklist

Before opening a pull request:

- Explain the problem and the chosen solution.
- Link the related issue when one exists.
- Call out migrations, API contract changes, and configuration changes.
- Add screenshots or a short recording for visible UI changes.
- Include verification commands and results.
- Describe risk and rollback steps for production-facing changes.
- Update documentation when behavior changes.

## Required Verification

Backend:

```bash
cd backend
uv run python manage.py check
uv run python manage.py test
```

Frontend:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Desktop host:

```bash
cd desktop
npm run typecheck
npm run test
npm run build:host
```

Run the Playwright suite for affected end-to-end flows:

```bash
cd frontend
npm run test:e2e
```

## Architecture Boundaries

- Keep Django models and migrations in the shared `api` app unless the architecture is intentionally changed.
- Route provider calls through `AIModelGateway`.
- Enforce organization and project scope for multi-tenant data.
- Put new frontend product work under `features/<domain>/` instead of expanding `App.tsx`.
- Use the shared API client and existing design system.
- Keep product logic in `frontend/`; `desktop/` owns only lifecycle, native
  capabilities, security boundaries, and distribution.
- Treat every new IPC channel as a versioned API and include validation and
  boundary tests.

See [Development Workflow](./docs/operations/development_workflow.md) and [Backend Modularization](./docs/architecture/backend_modularization.md) for the public engineering conventions.

## Conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Licensing Contributions

Marketing Hub is source-available under the [PolyForm Noncommercial License 1.0.0](./LICENSE). By submitting a pull request, you agree to license your contribution under the repository license and confirm that you have the right to submit it, including any third-party code, assets, data, and notices it contains. Commercial use requires a separate written license from the copyright holder.
