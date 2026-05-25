#!/usr/bin/env bash
# Routine production release (run on every version update).
# Does NOT run seed/bootstrap commands — use deploy/bootstrap.sh for first install.
# Usage: bash deploy/release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> Validating environment"
bash scripts/validate-env.sh .env
set -a
source .env
set +a

echo "==> Pulling/building updated images"
"${COMPOSE[@]}" up -d --build

echo "==> Running database migrations"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput

echo "==> Collecting static files"
"${COMPOSE[@]}" exec -T backend python manage.py collectstatic --noinput

echo "==> Restarting workers"
"${COMPOSE[@]}" restart backend celery celerybeat frontend nginx

echo "==> Waiting for readiness"
for _ in $(seq 1 30); do
  if curl -sf http://localhost/api/health/ready/ >/dev/null 2>&1; then
    echo "Release complete — API is ready."
    exit 0
  fi
  sleep 3
done

echo "ERROR: /api/health/ready/ did not become healthy in time." >&2
"${COMPOSE[@]}" ps
exit 1
