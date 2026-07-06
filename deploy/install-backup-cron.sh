#!/usr/bin/env bash
# Install daily backup cron on the production server.
# Usage: sudo bash deploy/install-backup-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_USER="${CRON_USER:-$(logname 2>/dev/null || echo root)}"
CRON_LINE="0 2 * * * cd ${ROOT} && /usr/bin/bash deploy/backup.sh >> ${ROOT}/logs/backup-cron.log 2>&1 || /usr/bin/bash deploy/notify-backup-status.sh failure \"Scheduled backup failed — see backup-cron.log\""

echo "Installing cron for user: ${CRON_USER}"
echo "  ${CRON_LINE}"

( crontab -u "$CRON_USER" -l 2>/dev/null | grep -v 'deploy/backup.sh' || true
  echo "$CRON_LINE"
) | crontab -u "$CRON_USER" -

mkdir -p "${ROOT}/logs"
touch "${ROOT}/logs/backup-cron.log"

echo "Cron installed. Verify with: crontab -u ${CRON_USER} -l"
