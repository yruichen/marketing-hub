<a name="readme-top"></a>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/yruichen/marketing-hub">
    <img src="https://img.icons8.com/color/150/000000/bullish.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Marketing Hub</h3>

  <p align="center">
    A modular SaaS workspace for marketing content generation, workflow orchestration, project management, and community sharing.
    <br />
    <a href="./docs/README.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#quick-start">View Demo</a>
    ·
    <a href="https://github.com/yruichen/marketing-hub/issues">Report Bug</a>
    ·
    <a href="https://github.com/yruichen/marketing-hub/issues">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#screenshots">Screenshots</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#repository-layout">Repository Layout</a></li>
    <li><a href="#features">Features</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#docker-compose">Docker Compose</a></li>
        <li><a href="#local-development">Local Development</a></li>
      </ul>
    </li>
    <li><a href="#environment-variables">Environment Variables</a></li>
    <li><a href="#development-standards">Development Standards</a></li>
    <li><a href="#verification">Verification</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

[![Product Name Screen Shot][product-screenshot]](https://example.com)

Marketing Hub is designed to centralize and automate marketing operations. It combines a visual workflow builder with AI-powered agents, comprehensive project management through folders and tags, and a collaborative community sharing ecosystem.

### Screenshots

| Workflow Canvas | Project Management |
| :---: | :---: |
| <img src="./docs/images/workflow.png" alt="Workflow Canvas" /> | <img src="./docs/images/project.png" alt="Project Manager" /> |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

This project is built atop modern web technologies and frameworks:

* [![React][React.js]][React-url]
* [![Vite][Vite.js]][Vite-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Tailwind][Tailwind]][Tailwind-url]
* [![Django][Django]][Django-url]
* [![PostgreSQL][PostgreSQL]][Postgres-url]
* [![Redis][Redis]][Redis-url]
* [![Celery][Celery]][Celery-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- REPOSITORY LAYOUT -->
## Repository Layout

- **[`frontend/`](./frontend)** - React application (React 19, Vite, TypeScript, Tailwind)
- **[`backend/`](./backend)** - Django monolith split into modular domain apps
- **[`docs/`](./docs)** - Architecture, development, and product documentation

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- FEATURES -->
## Features

- **Visual Workflow Canvas:** Custom agents and node I/O schema editing.
- **Project Structure:** Folder-based project management with customizable tags and statuses.
- **Billing & Subscriptions:** Flexible subscription plans alongside BYOK (Bring Your Own Key) model configurations.
- **Community ecosystem:** Publishing features and brand inspiration search.
- **Task Orchestration:** Async generation tasks with ledger-style tracking.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running, follow these steps.

### Docker Compose

The fastest way to run all services:

```bash
docker-compose up --build -d
```

**Services Available At:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `5432`
- Redis: `6379`

### Local Development

If you prefer to run services natively for active development:

**Backend Setup**
```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```

**Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```

**Celery Worker** (Start in a separate terminal)
```bash
cd backend
uv run celery -A core worker --loglevel=info
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ENVIRONMENT VARIABLES -->
## Environment Variables

Backend reads these common variables. Make sure they are set in your `.env` file or environment:

```env
DJANGO_SECRET_KEY=
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=

POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_HOST=
POSTGRES_PORT=

REDIS_URL=
CELERY_BROKER_URL=
CELERY_RESULT_BACKEND=

OBJECT_STORAGE_BACKEND=
OBJECT_STORAGE_BUCKET=
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DEVELOPMENT STANDARDS -->
## Development Standards

We adhere to the following architecture principles to keep the codebase maintainable:

- Keep domain logic in the matching Django app.
- Keep `api` as the compatibility and shared-model layer.
- Put shared contracts in `backend/api/contracts.py`.
- Put serializers in `backend/api/serializers.py`.
- Put request-scoped helpers in `backend/api/scope.py`.
- **Avoid** adding new business views in `api/views.py`.

See the full [Backend Module Guide](./backend/README.md) and [Backend Architecture](./backend/ARCHITECTURE.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- VERIFICATION -->
## Verification

Recommended checks before merging into the main branch:

```bash
# Backend checks
cd backend && uv run python manage.py check
cd backend && uv run python manage.py test

# Frontend checks
cd frontend && npm run lint
cd frontend && npm run build
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[product-screenshot]: ./docs/images/main_window.png
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vite.js]: https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[TypeScript]: https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Tailwind]: https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Django]: https://img.shields.io/badge/django-%23092E20.svg?style=for-the-badge&logo=django&logoColor=white
[Django-url]: https://www.djangoproject.com/
[PostgreSQL]: https://img.shields.io/badge/postgresql-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white
[Postgres-url]: https://www.postgresql.org/
[Redis]: https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white
[Redis-url]: https://redis.io/
[Celery]: https://img.shields.io/badge/celery-%2337814A.svg?style=for-the-badge&logo=celery&logoColor=white
[Celery-url]: https://docs.celeryq.dev/
