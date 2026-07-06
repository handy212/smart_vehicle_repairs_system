#!/usr/bin/env bash
# Deprecated — use deploy/backup.sh
echo "Note: deploy/docker-backup.sh is deprecated. Use: bash deploy/backup.sh" >&2
exec "$(dirname "$0")/backup.sh" "$@"
