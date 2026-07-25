<a name="readme-top"></a>

<div align="center">
  <img src="./docs/images/brand-mark.svg" alt="Marketing Hub brand mark" width="96" height="96" />

  <h1>Marketing Hub</h1>

  <p><strong>Turn one idea into an accountable AI marketing workflow.</strong></p>
  <p>A modular workspace for campaign planning, multimodal content generation, visual workflows, project assets, and AI cost governance.</p>

  <p>
    <a href="./README.zh-CN.md">简体中文</a>
    ·
    <a href="#quick-start">Quick start</a>
    ·
    <a href="./docs/README.md">Documentation</a>
    ·
    <a href="./CONTRIBUTING.md">Contributing</a>
  </p>

  <p>
    <a href="https://github.com/yruichen/marketing-hub/actions/workflows/ci.yml">
      <img src="https://github.com/yruichen/marketing-hub/actions/workflows/ci.yml/badge.svg" alt="CI status" />
    </a>
    <img src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white" alt="Python 3.12" />
    <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node.js 22" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111" alt="React 19" />
    <img src="https://img.shields.io/badge/Django-6-092E20?logo=django&logoColor=white" alt="Django 6" />
  </p>
</div>

## What It Does

Marketing Hub expands a simple brief into a traceable production system:

- Turn an idea into structured brand context and a runnable workflow draft.
- Orchestrate copy, image prompts, images, storyboards, audio, video, and review nodes on a visual canvas.
- Organize projects, folders, campaigns, favorites, reusable assets, templates, and brand memory.
- Track generation tasks, provider usage, tokens, cost, success rate, and workspace health.
- Govern multiple AI providers through lane-based model selection, BYOK, fallback policy, prompt versions, and cost auditing.

## Product Tour

| Idea to campaign | Workspace health |
| --- | --- |
| ![Marketing Hub brainstorm workspace](./docs/images/main_window.png) | ![Marketing Hub analytics dashboard](./docs/images/dashboard.png) |

| Visual workflows | Project assets |
| --- | --- |
| ![Marketing Hub workflow builder](./docs/images/workflow.png) | ![Marketing Hub project manager](./docs/images/project.png) |

## Why Marketing Hub

Most AI content tools stop at a generated result. Marketing Hub treats generation as an operational workflow:

- **Traceable execution** — queued, running, succeeded, and failed tasks are persisted and observable.
- **Composable workflows** — a DAG runtime validates node inputs and outputs, runs nodes in topological order, and supports retry.
- **Provider independence** — business features call one AI Gateway instead of coupling directly to a model vendor.
- **Tenant-aware collaboration** — organizations, memberships, RBAC, projects, campaigns, and assets share one workspace model.
- **Cost-aware generation** — provider, model, token, fallback, and estimated cost data remain attached to the work.

## Architecture

```text
React 19 + Vite + React Flow
              │
              │ session auth + REST API
              ▼
Django + DRF ── AI Gateway ── model providers
      │              │
      │              └── policy, prompts, fallback, cost
      ├── PostgreSQL
      └── Celery + Redis
```

The monorepo is split by runtime:

```text
marketing-hub/
  backend/        Django API, domain apps, workflow runtime, AI Gateway
  frontend/       React SPA, feature modules, visual workflow builder
  docs/           Product, architecture, operations, and planning docs
```

Backend domains include `accounts`, `workspaces`, `generation`, `community`, `billing`, and `ai_gateway`. Shared models, contracts, RBAC, and compatibility services live in `api`.

## Quick Start

### Docker Compose

Prerequisites: Docker and Docker Compose.

```bash
git clone https://github.com/yruichen/marketing-hub.git
cd marketing-hub
docker compose up
```

Then open:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api`

The Docker development configuration also starts PostgreSQL, Redis, and a Celery worker.

> Demo bootstrap is for local development only. Production checks reject demo bootstrap, mock providers, and insecure deployment settings.

### Local Development

Backend — Python 3.12 with `uv`:

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

Frontend — Node.js 22:

```bash
cd frontend
npm ci
npm run dev
```

Worker:

```bash
cd backend
uv run celery -A core worker --loglevel=info
```

See [.env.example](./.env.example) and [backend/.env.example](./backend/.env.example) for configuration.

## Verification

```bash
cd backend
uv run python manage.py check
uv run python manage.py test
```

```bash
cd frontend
npm run lint
npm run test
npm run build
```

GitHub Actions additionally checks migration drift and builds both production Docker images.

## Documentation

- [Documentation index](./docs/README.md)
- [Engineering playbook](./ENGINEERING_PLAYBOOK.md)
- [Development workflow](./docs/operations/development_workflow.md)
- [Backend modularization](./docs/architecture/backend_modularization.md)
- [Prompt governance](./docs/architecture/ai_content_generation_prompt_governance.md)
- [Global AI assistant plan](./docs/architecture/global_ai_assistant_upgrade_plan.md)
- [Product walkthrough](./docs/product/walkthrough.md)

## Project Status

Marketing Hub is under active development. The current focus is production hardening, workflow reliability, AI evaluation and governance, and a cleaner contribution surface.

Contributions and focused feedback are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md), use the issue forms, and report vulnerabilities through [SECURITY.md](./SECURITY.md).

The repository is currently private and has no public software license. Visibility and licensing will be decided explicitly before an open-source launch.

<p align="right"><a href="#readme-top">Back to top</a></p>
