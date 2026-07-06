#!/usr/bin/env bash
# First-time production bootstrap (run once after initial deploy).
# Usage: bash deploy/bootstrap.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> Validating environment"
bash scripts/validate-env.sh .env
set -a
source .env
set +a

echo "==> Starting core services"
"${COMPOSE[@]}" up -d --build db redis

echo "==> Waiting for database"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U "${DB_USER:-svr_user}" -d "${DB_NAME:-svr_db}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Building and starting application stack"
"${COMPOSE[@]}" up -d --build

echo "==> Running migrations and collecting static files"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput
"${COMPOSE[@]}" exec -T backend python manage.py collectstatic --noinput

echo "==> Initializing system data (first install only)"
"${COMPOSE[@]}" exec -T backend python manage.py init_permissions
"${COMPOSE[@]}" exec -T backend python manage.py init_settings
"${COMPOSE[@]}" exec -T backend python manage.py seed_modules
"${COMPOSE[@]}" exec -T backend python manage.py init_service_types
"${COMPOSE[@]}" exec -T backend python manage.py seed_leave_types
"${COMPOSE[@]}" exec -T backend python manage.py create_inspection_templates
"${COMPOSE[@]}" exec -T backend python manage.py create_all_email_templates
"${COMPOSE[@]}" exec -T backend python manage.py setup_invoice_email_templates

echo ""
echo "Bootstrap complete."
echo "Create the first admin user:"
echo "  ${COMPOSE[*]} exec backend python manage.py createsuperuser"
echo ""
echo "Verify readiness:"
echo "  curl -sf http://localhost/api/health/ready/"
