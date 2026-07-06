#!/usr/bin/env bash
# Production backup for Docker Compose deployments.
# Run on the production server (cron recommended: daily 02:00).
#
# Usage:
#   bash deploy/backup.sh
#   BACKUP_RETENTION_DAYS=30 bash deploy/backup.sh
#
# Optional offsite (requires AWS CLI and credentials in .env):
#   BACKUP_S3_URI=s3://your-bucket/svr-backups bash deploy/backup.sh
#
# Alerts (optional .env):
#   BACKUP_ALERT_WEBHOOK_URL=https://...
#   BACKUP_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
#   BACKUP_ALERT_EMAIL=ops@example.com
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NOTIFY="$ROOT/deploy/notify-backup-status.sh"
VERIFY="$ROOT/deploy/backup-verify.sh"

on_failure() {
  local line="$1"
  local msg="Backup failed at line ${line}"
  if [[ -x "$NOTIFY" ]]; then
    bash "$NOTIFY" failure "$msg" || true
  fi
  exit 1
}
trap 'on_failure $LINENO' ERR

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RUN_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
MANIFEST="${RUN_DIR}/manifest.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[backup]${NC} $*"; }
warn() { echo -e "${YELLOW}[backup]${NC} $*"; }
fail() { echo -e "${RED}[backup]${NC} $*" >&2; exit 1; }

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  fail "Missing .env in $ROOT"
fi

DB_NAME="${DB_NAME:-svr_db}"
DB_USER="${DB_USER:-svr_user}"

mkdir -p "$RUN_DIR"

log "Backup run ${TIMESTAMP} -> ${RUN_DIR}"

log "Database (pg_dump custom format)..."
"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "${RUN_DIR}/database.dump"

log "Media files..."
if [[ -d media ]]; then
  tar -czf "${RUN_DIR}/media.tar.gz" -C "$ROOT" media
else
  warn "No media/ directory — skipping media archive"
fi

log "Environment fingerprint (no secrets)..."
cat > "${RUN_DIR}/env-fingerprint.txt" <<EOF
timestamp=${TIMESTAMP}
django_environment=${DJANGO_ENVIRONMENT:-}
allowed_hosts=${ALLOWED_HOSTS:-}
api_url=${API_URL:-}
db_name=${DB_NAME}
db_user=${DB_USER}
EOF

log "Git revision (if available)..."
if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$ROOT" rev-parse HEAD > "${RUN_DIR}/git-revision.txt"
  git -C "$ROOT" describe --tags --always >> "${RUN_DIR}/git-revision.txt" 2>/dev/null || true
fi

cat > "$MANIFEST" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "database": "database.dump",
  "media": "media.tar.gz",
  "retention_days": ${RETENTION_DAYS},
  "status": "completed"
}
EOF

LATEST_LINK="${BACKUP_ROOT}/latest"
rm -f "$LATEST_LINK"
ln -s "$RUN_DIR" "$LATEST_LINK"

log "Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    log "Uploading to ${BACKUP_S3_URI}/${TIMESTAMP}/ ..."
    aws s3 sync "$RUN_DIR" "${BACKUP_S3_URI%/}/${TIMESTAMP}/" --only-show-errors
    log "Offsite upload complete."
  else
    warn "BACKUP_S3_URI is set but aws CLI is not installed — skipping offsite upload."
  fi
fi

log "Verifying database dump..."
if [[ ! -s "${RUN_DIR}/database.dump" ]]; then
  fail "database.dump is empty — backup failed"
fi

trap - ERR

if [[ -x "$VERIFY" ]]; then
  bash "$VERIFY" "$RUN_DIR"
fi

log "Backup complete."
ls -lh "$RUN_DIR"

if [[ -x "$NOTIFY" ]]; then
  bash "$NOTIFY" success "Backup ${TIMESTAMP} completed ($(du -sh "$RUN_DIR" | cut -f1))"
fi
