# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marketing Hub is a modular SaaS workspace for marketing content generation, workflow orchestration, project management, and community sharing. It's split into `backend/` (Django) and `frontend/` (React) — each with its own package manager and dependencies.

## Commands

### Full Stack (Docker)

```bash
docker compose up          # Starts postgres, redis, backend, worker, frontend
```

### Backend (Python 3.12, managed with `uv`)

```bash
cd backend
uv sync                                          # Install dependencies
uv run python manage.py runserver                 # Dev server on :8000
uv run python manage.py check                     # System checks
uv run python manage.py test                      # Run all tests
uv run python manage.py test api.tests.WorkspaceUpgradeTests.test_copy_generation  # Single test
uv run python manage.py makemigrations            # Create migrations
uv run python manage.py migrate                   # Apply migrations
celery -A core worker --loglevel=info             # Celery worker (needs Redis)
```

### Frontend (Node 22, npm)

```bash
cd frontend
npm ci                          # Install dependencies
npm run dev                     # Dev server on :5173
npm run build                   # Production build
npm run lint                    # ESLint
npm run test                    # Vitest (unit tests, single run)
npm run test:watch              # Vitest (watch mode)
npm run test:e2e                # Playwright E2E tests (needs dev server running)
npx playwright install          # Install Playwright browsers (first time)
```

## Architecture

### Backend — Domain-Modular Django

All Django models live in `api/models.py`. The `api/` app is the shared compatibility layer (models, migrations, serializers, contracts, RBAC, services, Celery tasks). Business logic is split into domain apps:

| App | Responsibility |
|---|---|
| `core/` | Django settings, URL routing, Celery config |
| `api/` | Models, serializers, services, RBAC, contracts, scope helpers |
| `accounts/` | Session login, membership CRUD |
| `workspaces/` | Orgs, projects, folders, campaigns, drafts, templates, dashboard |
| `generation/` | AI content generation endpoints (copy, image, storyboard, audio, content-package), task queue, workflow run/retry |
| `community/` | Publishing, likes, RAG search |
| `ai_gateway/` | AI provider adapter pattern (mock, agnes, openai, anthropic, gemini, local_proxy), capability registry, model policy, cost calculator, prompts |
| `billing/` | Subscription plans (free/pro/enterprise) with project limits |

**Key patterns:**
- **Multi-tenant with RBAC:** Organizations → Memberships (admin/creator/ops/viewer). RBAC matrix in `api/rbac.py`, permission classes in `api/permissions.py`.
- **Session auth** (not JWT). CSRF tokens managed by frontend's `apiFetch`.
- **Async tasks:** `GenerationTask` model tracks lifecycle (queued→running→succeeded/failed). Can run sync or via Celery. Frontend polls `/tasks/<pk>/`.
- **Workflow orchestration:** `WorkspaceDraft` stores DAGs (nodes+edges). `api/services.py` does topological sort and node-by-node execution with IO schema validation.
- **AI Gateway:** `AIModelGateway` dispatches to provider adapters. Lane-based config selection by task type. Auto-fallback to mock on failure. Prompt templates in `ai_gateway/prompts.py`.
- **Database:** PostgreSQL when `DATABASE_URL` or `POSTGRES_DB` env vars are set; SQLite3 fallback for local dev.

### Frontend — React SPA

Entry: `main.tsx` → `AppProviders.tsx` → `App.tsx`

`App.tsx` is a large monolithic component (~2800 lines) handling auth, onboarding, all AIGC state, API calls, task polling, and content rendering. Features are being modularized into `features/` directories.

| Directory | Purpose |
|---|---|
| `app/` | Providers (Router, QueryClient, ReactFlow), routes, navigation |
| `components/` | AppSidebar, WorkflowBuilder (lazy-loaded), ProjectManager, LoginPage, etc. |
| `features/` | Feature modules (mostly re-export from components/) |
| `shared/` | API client (`api/client.ts`), Zustand store (`uiStore.ts`), utilities |
| `hooks/` | `useApi.ts` — core API layer with CSRF handling, toast, clipboard |
| `types/` | TypeScript types (`workspace.ts` is the main type definitions file) |

**Key patterns:**
- **State:** Zustand for UI state (`uiStore`), TanStack Query for server state.
- **API layer:** `hooks/useApi.ts` provides `apiFetch` (with CSRF), `apiGet`, `apiPost`, `apiPatch`, `apiDelete`. Base URL from `VITE_API_BASE_URL`.
- **Styling:** Tailwind CSS with custom design system in `index.css` — editorial aesthetic with Lora/Space Grotesk/JetBrains Mono fonts, hand-cut paper shapes, stamp-dynamic buttons, dot-matrix grid backgrounds. Custom Tailwind colors: `neoYellow`, `neoGreen`, `neoRed`, `neoBlue`, `neoPurple`, `neoBg`.
- **Workflow canvas:** @xyflow/react (React Flow) for visual workflow builder, lazy-loaded.

## Environment Variables

**Backend** (set via env or Docker):
- `DATABASE_URL` / `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`
- `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`
- `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `CELERY_TASK_ALWAYS_EAGER`, `CELERY_TASK_EAGER_PROPAGATES` (for sync task execution in dev)

**Frontend:**
- `VITE_API_BASE_URL` (defaults to `http://localhost:8000/api`)

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:
- **Backend:** `uv sync` → `manage.py check` → `manage.py test`
- **Frontend:** `npm ci` → `npm run lint` → `npm run build`
