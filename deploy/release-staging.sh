#!/usr/bin/env bash
# Staging release — same as production release but uses staging compose overlay.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE=docker-compose.yml:docker-compose.staging.yml

bash scripts/validate-env.sh .env
set -a
source .env
set +a

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.staging.yml)

echo "==> Building and starting staging stack"
"${COMPOSE[@]}" up -d --build

echo "==> Migrations"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput

echo "==> Syncing permissions and role grants"
"${COMPOSE[@]}" exec -T backend python manage.py init_permissions

echo "==> Collectstatic"
"${COMPOSE[@]}" exec -T backend python manage.py collectstatic --noinput

echo "==> Restarting app services"
"${COMPOSE[@]}" restart backend celery celery-heavy celerybeat frontend nginx

PORT="${STAGING_HTTP_PORT:-8080}"
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/api/health/ready/" >/dev/null 2>&1; then
    echo "Staging release complete — ready on port ${PORT}"
    exit 0
  fi
  sleep 3
done

echo "ERROR: staging health check failed on port ${PORT}" >&2
"${COMPOSE[@]}" ps
exit 1
