#!/usr/bin/env bash
# Routine production release where Nginx Proxy Manager owns ports 80/443.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.prod.yml
  -f docker-compose.vps.yml
)

echo "==> Validating production environment"
bash scripts/validate-env.sh .env
set -a
# shellcheck disable=SC1091
source .env
set +a

case "${ALLOWED_HOSTS:-}|${API_URL:-}|${SECRET_KEY:-}|${DB_PASSWORD:-}" in
  *yourdomain*|*example.com*|*your-secret*|*your-secure*|*changeme*)
    echo "ERROR: .env contains placeholder values; refusing production release." >&2
    exit 1
    ;;
esac

if ! grep -q 'server_name app.aamobilitygroup.com' deploy/nginx/default.conf.http-npm || \
   ! grep -q 'server_name api.safetracksystems.com' deploy/nginx/default.conf.http-npm; then
  echo "ERROR: production nginx hostnames are missing; refusing release." >&2
  exit 1
fi

echo "==> Building and starting updated services"
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy >/dev/null
"${COMPOSE[@]}" up -d --build

echo "==> Applying database migrations"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput

echo "==> Syncing permissions and role grants"
# Required so new permission codes (e.g. manage_data_exchange) exist in production.
"${COMPOSE[@]}" exec -T backend python manage.py init_permissions

echo "==> Collecting static files"
"${COMPOSE[@]}" exec -T backend python manage.py collectstatic --noinput

echo "==> Restarting application services"
"${COMPOSE[@]}" restart backend celery celerybeat frontend nginx

echo "==> Waiting for readiness"
ready=false
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8080/api/health/ready/ >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 3
done

echo "==> Reclaiming build cache"
bash deploy/docker-prune.sh

if [ "$ready" = true ]; then
  echo "Release complete — API is ready on 127.0.0.1:8080."
  exit 0
fi

echo "ERROR: API did not become ready." >&2
"${COMPOSE[@]}" ps
exit 1
