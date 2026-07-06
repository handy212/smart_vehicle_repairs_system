#!/bin/bash
###############################################################################
# Root wrapper for UI-triggered production updates.
# Installed via deploy/sudoers-svr-system-update (NOPASSWD for user svr).
#
#   sudo /opt/smart_vehicle_repairs_system/deploy/run-system-update.sh --probe
#   sudo /opt/smart_vehicle_repairs_system/deploy/run-system-update.sh --ref main
###############################################################################

set -euo pipefail

SOURCE_DIR="/opt/smart_vehicle_repairs_system"
GIT_REF="main"

while [[ $# -gt 0 ]]; do
    case $1 in
        --probe)
            exit 0
            ;;
        --ref)
            GIT_REF="${2:?--ref requires a value}"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

if [ "$EUID" -ne 0 ]; then
    echo "This script must run as root (use sudo)." >&2
    exit 1
fi

if [ ! -x "$SOURCE_DIR/deploy/update-production.sh" ]; then
    echo "update-production.sh not found under $SOURCE_DIR/deploy" >&2
    exit 1
fi

exec bash "$SOURCE_DIR/deploy/update-production.sh" --ref "$GIT_REF"
