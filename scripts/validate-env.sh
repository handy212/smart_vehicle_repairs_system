#!/usr/bin/env bash
# Pre-flight validation for production/staging .env files.
# Usage: bash scripts/validate-env.sh [.env]
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file not found: $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

errors=()
warnings=()

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    errors+=("Missing required variable: $name")
  fi
}

warn_if_placeholder() {
  local name="$1"
  local value="${!name:-}"
  case "$value" in
    *changeme*|*your-*|*example.com*|*here-generate*)
      warnings+=("$name looks like a placeholder value")
      ;;
  esac
}

ENVIRONMENT="${DJANGO_ENVIRONMENT:-development}"
ENVIRONMENT="${ENVIRONMENT,,}"

if [ "$ENVIRONMENT" = "development" ] && { [ "${DEBUG:-}" = "False" ] || [ "${DEBUG:-}" = "false" ]; }; then
  warnings+=("DEBUG=false but DJANGO_ENVIRONMENT=development — set DJANGO_ENVIRONMENT=production")
fi

if [ "$ENVIRONMENT" = "production" ] || [ "$ENVIRONMENT" = "staging" ]; then
  require_var SECRET_KEY
  require_var ALLOWED_HOSTS
  require_var DB_PASSWORD
  require_var REDIS_PASSWORD

  if [ -z "${DATABASE_URL:-}" ] && [ -z "${DB_NAME:-}" ]; then
    errors+=("Set DATABASE_URL or DB_NAME for database configuration")
  fi

  if [ -z "${REDIS_URL:-}" ]; then
    warnings+=("REDIS_URL not set — compose files construct it from REDIS_PASSWORD")
  fi

  if [ "$ENVIRONMENT" = "production" ]; then
    if [ "${QUICKBOOKS_SANDBOX_ENABLED:-}" = "True" ] || [ "${QUICKBOOKS_SANDBOX_ENABLED:-}" = "true" ]; then
      warnings+=("QUICKBOOKS_SANDBOX_ENABLED=true in production — use live QBO credentials only when intended")
    fi
    if [ "${HUBTEL_SANDBOX:-}" = "True" ] || [ "${HUBTEL_SANDBOX:-}" = "true" ]; then
      warnings+=("HUBTEL_SANDBOX=true in production — disable for live payments/SMS")
    fi
    if [ "${QUICKBOOKS_SYNC_INLINE:-}" = "True" ] || [ "${QUICKBOOKS_SYNC_INLINE:-}" = "true" ]; then
      warnings+=("QUICKBOOKS_SYNC_INLINE=true in production — run a Celery worker instead")
    fi
  fi

  warn_if_placeholder SECRET_KEY
  warn_if_placeholder DB_PASSWORD
  warn_if_placeholder REDIS_PASSWORD
fi

if [ "${#errors[@]}" -gt 0 ]; then
  echo "Environment validation failed for $ENV_FILE:" >&2
  for msg in "${errors[@]}"; do
    echo "  ERROR: $msg" >&2
  done
  exit 1
fi

if [ "${#warnings[@]}" -gt 0 ]; then
  echo "Environment warnings for $ENV_FILE:"
  for msg in "${warnings[@]}"; do
    echo "  WARN: $msg"
  done
fi

echo "Environment validation passed ($ENVIRONMENT)."
