#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "==> Created .env from .env.example — review VITE_API_BASE_URL before production use"
  else
    echo "==> ERROR: missing .env (copy .env.example to .env and set VITE_API_BASE_URL)"
    exit 1
  fi
fi

# shellcheck disable=SC1091
set -a && . ./.env && set +a

if [ ! -f backend/.env ]; then
  echo "==> ERROR: missing backend/.env (copy backend/.env.example and set secrets)"
  exit 1
fi
if ! grep -qE '^FIELD_ENCRYPTION_KEY=.+$' backend/.env; then
  echo "==> WARNING: backend/.env has no FIELD_ENCRYPTION_KEY — BYOK key save will fail (HTTP 500/503)"
fi

echo "==> Building images"
docker compose "${COMPOSE_FILES[@]}" build

echo "==> Running database migrations"
docker compose "${COMPOSE_FILES[@]}" run --rm backend uv run python manage.py migrate --noinput

echo "==> Starting services"
docker compose "${COMPOSE_FILES[@]}" up -d --remove-orphans

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Service status"
docker compose "${COMPOSE_FILES[@]}" ps

echo "Deploy finished."
echo "Frontend: host port ${FRONTEND_PORT:-5173} -> container :80"
echo "Backend:  host port 8000 -> container :8000"
