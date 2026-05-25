#!/usr/bin/env bash
# Validate production environment variables before deploy.
# Usage: bash scripts/validate-env.sh [.env]
set -euo pipefail

ENV_FILE="${1:-.env}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Missing env file: ${ENV_FILE}${NC}"
  echo "Copy .env.production.example to .env and fill in values."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

REQUIRED_VARS=(
  DJANGO_ENVIRONMENT
  SECRET_KEY
  ALLOWED_HOSTS
  DB_NAME
  DB_USER
  DB_PASSWORD
  REDIS_PASSWORD
  API_URL
  CORS_ALLOWED_ORIGINS
)

FORBIDDEN_VALUES=(
  changeme
  your-secret-key-here
  your-secret-key-here-generate-with-script
  your-secure-database-password
  your-secure-redis-password
)

errors=0

check_required() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo -e "${RED}✗ ${name} is not set${NC}"
    errors=$((errors + 1))
    return
  fi
  for forbidden in "${FORBIDDEN_VALUES[@]}"; do
    if [[ "$value" == "$forbidden" ]]; then
      echo -e "${RED}✗ ${name} still has placeholder value${NC}"
      errors=$((errors + 1))
      return
    fi
  done
  echo -e "${GREEN}✓ ${name}${NC}"
}

echo -e "${YELLOW}Validating ${ENV_FILE}...${NC}"
echo ""

for var in "${REQUIRED_VARS[@]}"; do
  check_required "$var"
done

if [[ "${DEBUG:-False}" == "True" || "${DEBUG:-false}" == "true" ]]; then
  echo -e "${YELLOW}⚠ DEBUG is enabled — disable for production${NC}"
fi

if [[ "${DJANGO_ENVIRONMENT:-}" != "production" ]]; then
  echo -e "${YELLOW}⚠ DJANGO_ENVIRONMENT is '${DJANGO_ENVIRONMENT:-}' (expected production)${NC}"
fi

if [[ ${#SECRET_KEY} -lt 50 ]]; then
  echo -e "${YELLOW}⚠ SECRET_KEY is shorter than 50 characters${NC}"
fi

echo ""
if [[ $errors -gt 0 ]]; then
  echo -e "${RED}Validation failed with ${errors} error(s).${NC}"
  exit 1
fi

echo -e "${GREEN}Environment validation passed.${NC}"
