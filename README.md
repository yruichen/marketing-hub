# Marketing Hub

Marketing Hub is a modular SaaS workspace for marketing content generation, workflow orchestration, project management, and community sharing.

## Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS
- Backend: Django 6, Django REST Framework, Celery
- Data: PostgreSQL for relational data, Redis for cache and broker
- Tooling: uv, npm, Docker Compose

## Repository Layout

- [frontend/](./frontend) - React application
- [backend/](./backend) - Django monolith split into domain apps
- [docs/](./docs) - Architecture, development, and product documentation

## Features

- Visual workflow canvas with custom agents and node I/O schema
- Folder-based project management with tags and status
- Subscription plans and BYOK model configuration
- Community publishing and brand inspiration search
- Async generation tasks with ledger-style tracking

## Quick Start

### Docker Compose

```bash
docker-compose up --build -d
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `5432`
- Redis: `6379`

### Local Development

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

```bash
cd frontend
npm install
npm run dev
```

Start Celery worker in another terminal:

```bash
cd backend
uv run celery -A core worker --loglevel=info
```

## Environment Variables

Backend reads these common variables:

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `OBJECT_STORAGE_BACKEND`
- `OBJECT_STORAGE_BUCKET`

## Development Standards

- Keep domain logic in the matching Django app.
- Keep `api` as the compatibility and shared-model layer.
- Put shared contracts in `backend/api/contracts.py`.
- Put serializers in `backend/api/serializers.py`.
- Put request-scoped helpers in `backend/api/scope.py`.
- Avoid new business views in `api/views.py`.

## Documentation

- [Backend architecture](./backend/ARCHITECTURE.md)
- [Backend module guide](./backend/README.md)
- [Documentation index](./docs/README.md)

## Verification

Recommended checks before merging:

```bash
cd backend && uv run python manage.py check
cd backend && uv run python manage.py test
cd frontend && npm run lint
cd frontend && npm run build
```

