#!/bin/bash
###############################################################################
# Legacy systemd production update (/opt -> /var/www/svr).
#
# Routine release (no data re-seeding):
#   sudo bash deploy/update-production.sh
#
# Pin a ref:
#   sudo bash deploy/update-production.sh --ref v1.2.3
#
# First install / explicit re-seed (run once, or only when needed):
#   sudo bash deploy/update-production.sh --bootstrap
#
# New deployments should use Docker: deploy/release.sh
###############################################################################

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

SOURCE_DIR="/opt/smart_vehicle_repairs_system"
TARGET_DIR="/var/www/svr"
GIT_REF="main"
RUN_BOOTSTRAP=false
FULL_REBUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --ref)
            GIT_REF="${2:?--ref requires a value}"
            shift 2
            ;;
        --bootstrap)
            RUN_BOOTSTRAP=true
            shift
            ;;
        --full)
            FULL_REBUILD=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--ref <branch-or-tag>] [--bootstrap] [--full]"
            exit 1
            ;;
    esac
done

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}Source directory not found: $SOURCE_DIR${NC}"
    exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}Target directory not found: $TARGET_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}=========================================="
echo "Smart Vehicle Repairs - Production Update"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}Source:${NC} $SOURCE_DIR"
echo -e "${BLUE}Target:${NC} $TARGET_DIR"
echo -e "${BLUE}Ref:${NC}   $GIT_REF"
echo ""

echo -e "${YELLOW}[1/4] Fetching and checking out $GIT_REF...${NC}"
cd "$SOURCE_DIR"
git fetch --tags origin
git checkout "$GIT_REF"
if git rev-parse --verify "origin/$GIT_REF" >/dev/null 2>&1; then
    git pull --ff-only origin "$GIT_REF"
fi

if [ -x "$SOURCE_DIR/scripts/validate-env.sh" ] && [ -f "$TARGET_DIR/.env" ]; then
    echo -e "${YELLOW}[2/4] Validating production environment...${NC}"
    bash "$SOURCE_DIR/scripts/validate-env.sh" "$TARGET_DIR/.env"
else
    echo -e "${YELLOW}[2/4] Skipping env validation (script or .env not found)${NC}"
fi

DEPLOY_ARGS=(--fast)
if [ "${FULL_REBUILD:-false}" = true ]; then
    DEPLOY_ARGS=(--rebuild-frontend --rebuild-backend --restart)
fi
if [ "$RUN_BOOTSTRAP" = true ]; then
    DEPLOY_ARGS+=(--bootstrap)
fi

echo -e "${YELLOW}[3/4] Syncing, building, and restarting via deploy.sh...${NC}"
bash "$SOURCE_DIR/deploy/deploy.sh" "${DEPLOY_ARGS[@]}"

echo -e "${YELLOW}[4/4] Waiting for API readiness...${NC}"
READY=false
for _ in $(seq 1 30); do
    if curl -sf http://localhost:8000/api/health/ready/ >/dev/null 2>&1 \
        || curl -sf http://localhost/api/health/ready/ >/dev/null 2>&1; then
        READY=true
        break
    fi
    sleep 3
done

echo ""
if [ "$READY" = true ]; then
    echo -e "${GREEN}✓ API readiness check passed${NC}"
    if [ -d "$SOURCE_DIR/.git" ]; then
        git -C "$SOURCE_DIR" rev-parse HEAD > "$TARGET_DIR/DEPLOYED_COMMIT"
        chown svr:svr "$TARGET_DIR/DEPLOYED_COMMIT" 2>/dev/null || true
    fi
else
    echo -e "${RED}✗ API readiness check failed — inspect service logs${NC}"
    systemctl status svr svr-celery svr-celery-qbo svr-celerybeat svr-nextjs nginx --no-pager -l || true
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Production Update Complete!"
echo -e "==========================================${NC}"
echo ""

APP_URL="${APP_URL:-}"
if [ -z "$APP_URL" ] && [ -f "$TARGET_DIR/.env" ]; then
    APP_URL="$(grep -E '^FRONTEND_URL=' "$TARGET_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [ -n "$APP_URL" ]; then
    echo "Application URL: $APP_URL"
else
    echo "Check your configured frontend URL in $TARGET_DIR/.env"
fi

echo ""
echo "Monitor logs with:"
echo "  sudo tail -f $TARGET_DIR/logs/production.log"
echo "  sudo journalctl -u svr -f"
