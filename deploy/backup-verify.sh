#!/usr/bin/env bash
# Verify the latest backup set is usable.
# Usage: bash deploy/backup-verify.sh [backups/latest]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-$ROOT/backups/latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}[verify]${NC} $*" >&2; exit 1; }
ok() { echo -e "${GREEN}[verify]${NC} $*"; }

[[ -d "$BACKUP_DIR" ]] || fail "Backup directory not found: $BACKUP_DIR"

DUMP="${BACKUP_DIR}/database.dump"
[[ -f "$DUMP" ]] || fail "Missing database.dump"
[[ -s "$DUMP" ]] || fail "database.dump is empty"

MIN_BYTES="${BACKUP_MIN_BYTES:-1024}"
SIZE=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
if [[ "$SIZE" -lt "$MIN_BYTES" ]]; then
  fail "database.dump too small (${SIZE} bytes)"
fi
ok "database.dump size OK (${SIZE} bytes)"

if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$DUMP" >/dev/null || fail "pg_restore --list failed — corrupt dump?"
  ok "pg_restore --list OK"
else
  # Inside Docker host without pg_restore — use db container
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
    COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.prod.yml")
    if "${COMPOSE[@]}" ps -q db >/dev/null 2>&1; then
      cat "$DUMP" | "${COMPOSE[@]}" exec -T db pg_restore --list >/dev/null \
        || fail "pg_restore --list via container failed"
      ok "pg_restore --list via db container OK"
    fi
  fi
fi

if [[ -f "${BACKUP_DIR}/media.tar.gz" ]]; then
  tar -tzf "${BACKUP_DIR}/media.tar.gz" >/dev/null || fail "media.tar.gz is corrupt"
  ok "media.tar.gz OK"
fi

[[ -f "${BACKUP_DIR}/manifest.json" ]] || fail "Missing manifest.json"
ok "Backup verification passed: $BACKUP_DIR"
