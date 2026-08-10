# Backend Guide

The backend is organized as a domain-modular Django application set. The `api` app remains the compatibility and shared-model layer, while new business logic belongs in the domain apps listed below.

## App Map

- `api`
  - Models, migrations, admin, Celery entrypoints, shared contracts, serializers, and compatibility imports.
- `accounts`
  - Authentication and account-related endpoints.
- `workspaces`
  - Organizations, projects, folders, campaigns, drafts, templates, and dashboard endpoints.
- `generation`
  - Copy, image, storyboard, audio generation, task queue, workflow execution, and node retry.
- `community`
  - Community publishing, likes, and brand inspiration search.
- `ai_gateway`
  - Provider configuration and compatibility entry points.
- `harness`
  - AI contracts, capabilities, versioned prompts/evals, runtime, policy, ports, and adapters.
- `billing`
  - Subscription plans and quota rules.

## Core Files

- `backend/api/contracts.py` - Shared domain contracts and IO schema.
- `backend/api/scope.py` - Request scope helpers and slug utilities.
- `backend/api/serializers.py` - Shared model serializers.
- `backend/harness/facade.py` - Stable AI boundary used by business services.
- `docs/architecture/ai_harness.md` - Harness dependency and extension rules.

## Local Workflow

```bash
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
uv run celery -A core worker --loglevel=info
```

## Standard Commands

```bash
uv run python manage.py check
uv run python manage.py test
uv run python manage.py makemigrations
uv run python manage.py migrate
```

## Contribution Rules

- Do not add new business views to `api/views.py`.
- Do not hardcode serializations inside views when a serializer is reusable.
- Prefer one domain app per business area.
- Keep compatibility URLs stable unless there is a deliberate migration plan.
- Put shared request helpers in `api/scope.py`, not inside individual views.
- Keep provider calls and prompt assets behind the harness boundary.
- Never return synthetic generation results when configuration or providers fail.
