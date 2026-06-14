#!/bin/bash

###############################################################################
# Legacy systemd deployment script (bare-metal /var/www/svr installs).
# Syncs changes from /opt/smart_vehicle_repairs_system to /var/www/svr.
#
# New deployments should use Docker: deploy/bootstrap.sh + deploy/release.sh
#
# Usage:
#   sudo bash deploy/deploy.sh
#   sudo bash deploy/deploy.sh --rebuild-frontend --rebuild-backend --restart
#   sudo bash deploy/deploy.sh --all
#   sudo bash deploy/deploy.sh --bootstrap   # first install / explicit re-seed only
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SOURCE_DIR="/opt/smart_vehicle_repairs_system"
TARGET_DIR="/var/www/svr"

REBUILD_FRONTEND=false
REBUILD_BACKEND=false
RESTART_SERVICES=false
RUN_BOOTSTRAP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --rebuild-frontend)
            REBUILD_FRONTEND=true
            shift
            ;;
        --rebuild-backend)
            REBUILD_BACKEND=true
            shift
            ;;
        --restart)
            RESTART_SERVICES=true
            shift
            ;;
        --bootstrap)
            RUN_BOOTSTRAP=true
            shift
            ;;
        --all)
            REBUILD_FRONTEND=true
            REBUILD_BACKEND=true
            RESTART_SERVICES=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--rebuild-frontend] [--rebuild-backend] [--restart] [--bootstrap] [--all]"
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
    echo -e "${YELLOW}Creating target directory: $TARGET_DIR${NC}"
    mkdir -p "$TARGET_DIR"
    chown -R svr:svr "$TARGET_DIR"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Legacy systemd deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Source:${NC} $SOURCE_DIR"
echo -e "${GREEN}Target:${NC} $TARGET_DIR"
echo ""

ENV_BACKUP=""
if [ -f "$TARGET_DIR/.env" ]; then
    ENV_BACKUP="$TARGET_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}Backing up production .env file...${NC}"
    cp "$TARGET_DIR/.env" "$ENV_BACKUP"
fi

echo -e "${GREEN}Syncing files...${NC}"
rsync -av \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='.cursor' \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.pyo' \
    --exclude='.pytest_cache' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.npm' \
    --exclude='.cache' \
    --exclude='logs' \
    --exclude='media' \
    --exclude='static' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.log' \
    --exclude='*.sqlite3' \
    --exclude='db.sqlite3' \
    --exclude='Attached_image.png' \
    --delete \
    "$SOURCE_DIR/" "$TARGET_DIR/"

if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    echo -e "${GREEN}Restoring production .env file...${NC}"
    mv "$ENV_BACKUP" "$TARGET_DIR/.env"
fi

echo -e "${GREEN}Setting file permissions...${NC}"
chown -R svr:svr "$TARGET_DIR"

mkdir -p "$TARGET_DIR/logs" "$TARGET_DIR/media" "$TARGET_DIR/static"
chown -R svr:svr "$TARGET_DIR/logs" "$TARGET_DIR/media" "$TARGET_DIR/static"

echo ""
echo -e "${GREEN}✓ Files synced successfully!${NC}"
echo ""

run_bootstrap_data() {
    echo -e "${YELLOW}Running bootstrap data commands (first install / explicit re-seed)...${NC}"
    cd "$TARGET_DIR"
    source venv/bin/activate

    python manage.py init_permissions
    python manage.py init_settings
    python manage.py seed_modules
    python manage.py create_super_admin
    python manage.py init_service_types
    python manage.py seed_aa_membership
    python manage.py seed_leave_types
    python manage.py populate_comprehensive_code_library
    python manage.py sync_code_library --limit 50
    python manage.py create_all_email_templates
    python manage.py setup_invoice_email_templates
    python manage.py create_inspection_templates

    deactivate
    echo -e "${GREEN}✓ Bootstrap data commands finished${NC}"
    echo ""
}

if [ "$REBUILD_FRONTEND" = true ]; then
    echo -e "${YELLOW}Rebuilding frontend...${NC}"
    cd "$TARGET_DIR/frontend"

    if [ -d ".next" ]; then
        chown -R svr:svr .next 2>/dev/null || true
    fi

    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        sudo -u svr npm install
    fi

    echo -e "${YELLOW}Building Next.js application...${NC}"
    sudo -u svr npm run build

    echo -e "${GREEN}✓ Frontend rebuilt!${NC}"
    echo ""
fi

if [ "$REBUILD_BACKEND" = true ]; then
    echo -e "${YELLOW}Rebuilding backend...${NC}"
    cd "$TARGET_DIR"

    if [ ! -d "venv" ]; then
        echo -e "${RED}Python virtualenv not found at $TARGET_DIR/venv${NC}"
        exit 1
    fi

    source venv/bin/activate

    echo -e "${YELLOW}Installing Python dependencies...${NC}"
    pip install -q -r requirements.txt

    echo -e "${YELLOW}Running database migrations...${NC}"
    python manage.py migrate --noinput

    echo -e "${YELLOW}Collecting static files...${NC}"
    python manage.py collectstatic --noinput --clear

    deactivate

    echo -e "${GREEN}✓ Backend rebuilt!${NC}"
    echo ""
fi

if [ "$RUN_BOOTSTRAP" = true ]; then
    if [ ! -d "$TARGET_DIR/venv" ]; then
        echo -e "${RED}Python virtualenv not found at $TARGET_DIR/venv${NC}"
        exit 1
    fi
    run_bootstrap_data
fi

if [ "$RESTART_SERVICES" = true ]; then
    echo -e "${YELLOW}Restarting services...${NC}"

    for service in svr svr-nextjs svr-celery svr-celerybeat nginx; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            echo -e "${BLUE}  → Restarting $service...${NC}"
            systemctl restart "$service"
        fi
    done

    echo -e "${GREEN}✓ Services restarted!${NC}"
    echo ""
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${BLUE}Service Status:${NC}"
for service in svr svr-nextjs svr-celery svr-celerybeat nginx; do
    if systemctl is-active "$service" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $service"
    else
        echo -e "  ${RED}✗${NC} $service"
    fi
done
