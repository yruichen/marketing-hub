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

See [ENGINEERING_PLAYBOOK.md](./ENGINEERING_PLAYBOOK.md) for the full engineering conventions.

## Conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Licensing Contributions

Marketing Hub uses a source-available noncommercial license plus separate commercial licensing. By opening a pull request, contributors must explicitly accept [CONTRIBUTOR_TERMS.md](./CONTRIBUTOR_TERMS.md), which preserves contributor ownership while granting the project the rights needed to distribute and commercially sublicense contributions.

Existing contributions require separate explicit acceptance before a public commercial launch. Consult qualified legal counsel before relying on these terms for a commercial transaction.
