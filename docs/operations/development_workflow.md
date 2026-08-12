# Development Workflow

This project follows a practical SaaS monorepo workflow: stable module boundaries, repeatable local setup, automated verification, and small reviewable changes.

## Branching

- Use short-lived feature branches.
- Keep pull requests focused on one product or technical concern.
- Avoid mixing refactors, feature work, and unrelated formatting in one change.

Recommended branch names:

- `feature/workflow-canvas-pan`
- `fix/project-folder-filter`
- `refactor/backend-generation-app`
- `docs/backend-module-map`

## Commit Style

Use clear, conventional prefixes:

- `feat:` user-facing feature
- `fix:` bug fix
- `refactor:` behavior-preserving restructuring
- `docs:` documentation only
- `test:` test-only changes
- `chore:` tooling or maintenance

Examples:

```text
feat: add workflow node io schema validation
fix: stop project manager from refetching on every filter keystroke
refactor: split generation endpoints into domain app
docs: document backend module ownership
```

## Local Setup

Backend:

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Worker:

```bash
cd backend
uv run celery -A core worker --loglevel=info
```

Desktop host (with the API running and frontend dependencies installed):

```bash
cd desktop
npm ci
npm run dev
```

## Verification Before Merge

Run these checks before opening or merging a PR:

```bash
cd backend
uv run python manage.py check
uv run python manage.py test
```

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd desktop
npm run typecheck
npm run test
npm run build:host
```

## Code Ownership

- Backend endpoint ownership is split by Django app.
- Frontend should continue moving large screens into focused components.
- Desktop owns operating-system integration and distribution, never product
  domain logic.
- Shared contracts must be explicit and versionable.
- Data model changes require migrations and tests.

## Review Checklist

- Does this change stay within the right module boundary?
- Are API paths backward compatible?
- Are database migrations included when models change?
- Are error states handled?
- Are user-facing labels understandable to non-engineers?
- Did the author run backend and frontend verification commands?
