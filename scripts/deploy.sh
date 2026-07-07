#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)

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
