#!/usr/bin/env bash
# Send backup success/failure notification.
# Usage: bash deploy/notify-backup-status.sh success|failure [message]
set -euo pipefail

STATUS="${1:-failure}"
MESSAGE="${2:-Backup script exited with an error}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
TIMESTAMP="$(date -Iseconds)"
PAYLOAD=$(cat <<EOF
{
  "status": "${STATUS}",
  "message": "${MESSAGE}",
  "host": "${HOSTNAME}",
  "timestamp": "${TIMESTAMP}",
  "service": "smart_vehicle_repairs_system"
}
EOF
)

notify_webhook() {
  local url="$1"
  curl -fsS -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    --max-time 15 >/dev/null
}

if [[ -n "${BACKUP_ALERT_WEBHOOK_URL:-}" ]]; then
  if notify_webhook "$BACKUP_ALERT_WEBHOOK_URL"; then
    echo "[notify] Webhook alert sent (${STATUS})"
  else
    echo "[notify] Webhook alert failed" >&2
  fi
fi

# Slack-compatible secondary URL (optional)
if [[ -n "${BACKUP_ALERT_SLACK_WEBHOOK_URL:-}" ]]; then
  SLACK_PAYLOAD=$(cat <<EOF
{"text": "[SVR Backup ${STATUS}] ${MESSAGE} on ${HOSTNAME} at ${TIMESTAMP}"}
EOF
)
  curl -fsS -X POST "$BACKUP_ALERT_SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$SLACK_PAYLOAD" \
    --max-time 15 >/dev/null || true
fi

if [[ -n "${BACKUP_ALERT_EMAIL:-}" ]] && command -v mail >/dev/null 2>&1; then
  echo "$MESSAGE" | mail -s "[SVR Backup ${STATUS}] ${HOSTNAME}" "$BACKUP_ALERT_EMAIL" || true
fi
