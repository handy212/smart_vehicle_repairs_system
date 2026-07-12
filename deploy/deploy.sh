#!/bin/bash

###############################################################################
# Legacy systemd deployment script (bare-metal /var/www/svr installs).
# Syncs changes from /opt/smart_vehicle_repairs_system to /var/www/svr.
#
# New deployments should use Docker: deploy/bootstrap.sh + deploy/release.sh
#
# Usage:
#   sudo bash deploy/deploy.sh --fast          # recommended: sync + rebuild only what changed
#   sudo bash deploy/deploy.sh                 # sync files only (no build/restart)
#   sudo bash deploy/deploy.sh --all           # full rebuild (slowest)
#   sudo bash deploy/deploy.sh --rebuild-frontend --restart
#   sudo bash deploy/deploy.sh --bootstrap     # first install / explicit re-seed only
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SOURCE_DIR="/opt/smart_vehicle_repairs_system"
TARGET_DIR="/var/www/svr"
DEPLOY_META_DIR="$TARGET_DIR/.deploy"

REBUILD_FRONTEND=false
REBUILD_BACKEND=false
RESTART_SERVICES=false
RUN_BOOTSTRAP=false
FAST_DEPLOY=false

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
        --fast)
            FAST_DEPLOY=true
            RESTART_SERVICES=true
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
            echo "Usage: $0 [--fast] [--rebuild-frontend] [--rebuild-backend] [--restart] [--bootstrap] [--all]"
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

detect_changes_since_last_deploy() {
    FRONTEND_CHANGED=false
    BACKEND_CHANGED=false
    REQUIREMENTS_CHANGED=false
    STATIC_SOURCES_CHANGED=false

    local last_commit=""
    if [ -f "$TARGET_DIR/DEPLOYED_COMMIT" ]; then
        last_commit="$(tr -d '[:space:]' < "$TARGET_DIR/DEPLOYED_COMMIT")"
    fi

    if [ -z "$last_commit" ] || ! git -C "$SOURCE_DIR" cat-file -e "${last_commit}^{commit}" 2>/dev/null; then
        echo -e "${YELLOW}No previous deploy commit recorded — full rebuild required.${NC}"
        FRONTEND_CHANGED=true
        BACKEND_CHANGED=true
        REQUIREMENTS_CHANGED=true
        STATIC_SOURCES_CHANGED=true
        return
    fi

    if [ "$last_commit" = "$(git -C "$SOURCE_DIR" rev-parse HEAD)" ]; then
        echo -e "${GREEN}Source commit unchanged since last deploy.${NC}"
        return
    fi

    local changed
    changed="$(git -C "$SOURCE_DIR" diff --name-only "$last_commit" HEAD || true)"
    if [ -z "$changed" ]; then
        return
    fi

    if echo "$changed" | grep -qE '^frontend/'; then
        FRONTEND_CHANGED=true
    fi

    if echo "$changed" | grep -qE '^(apps/|config/|manage\.py|requirements.*\.txt|pyproject\.toml)'; then
        BACKEND_CHANGED=true
    fi

    if echo "$changed" | grep -qE '^requirements.*\.txt$'; then
        REQUIREMENTS_CHANGED=true
    fi

    if echo "$changed" | grep -qE '(^apps/.*/static/|/migrations/|\.(css|js|svg|png|jpg|woff2?)$)'; then
        STATIC_SOURCES_CHANGED=true
    fi

    echo -e "${BLUE}Changes since last deploy:${NC}"
    if [ "$FRONTEND_CHANGED" = true ]; then
        echo -e "  ${YELLOW}→${NC} frontend rebuild"
    fi
    if [ "$BACKEND_CHANGED" = true ]; then
        echo -e "  ${YELLOW}→${NC} backend update"
        if [ "$REQUIREMENTS_CHANGED" = true ]; then
            echo -e "    ${YELLOW}→${NC} pip install"
        fi
        if [ "$STATIC_SOURCES_CHANGED" = true ]; then
            echo -e "    ${YELLOW}→${NC} collectstatic"
        fi
    fi
    if [ "$FRONTEND_CHANGED" = false ] && [ "$BACKEND_CHANGED" = false ]; then
        echo -e "  ${GREEN}→${NC} sync + service restart only"
    fi
    echo ""
}

apply_fast_plan() {
    detect_changes_since_last_deploy
    if [ "$FRONTEND_CHANGED" = true ]; then
        REBUILD_FRONTEND=true
    fi
    if [ "$BACKEND_CHANGED" = true ]; then
        REBUILD_BACKEND=true
    fi
}

ENV_BACKUP=""
if [ -f "$TARGET_DIR/.env" ]; then
    ENV_BACKUP="$TARGET_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}Backing up production .env file...${NC}"
    cp "$TARGET_DIR/.env" "$ENV_BACKUP"
fi

echo -e "${GREEN}Syncing files...${NC}"
rsync -a \
    --info=stats2 \
    --chown=svr:svr \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='.cursor' \
    --exclude='.agent' \
    --exclude='.codex' \
    --exclude='.config' \
    --exclude='coverage.xml' \
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

mkdir -p "$DEPLOY_META_DIR" "$TARGET_DIR/logs" "$TARGET_DIR/media" "$TARGET_DIR/static"
chown svr:svr "$DEPLOY_META_DIR" "$TARGET_DIR/logs" "$TARGET_DIR/media" "$TARGET_DIR/static"

echo ""
echo -e "${GREEN}✓ Files synced successfully!${NC}"
echo ""

write_deployed_commit() {
    if [ -d "$SOURCE_DIR/.git" ]; then
        git -C "$SOURCE_DIR" rev-parse HEAD > "$TARGET_DIR/DEPLOYED_COMMIT"
        chown svr:svr "$TARGET_DIR/DEPLOYED_COMMIT" 2>/dev/null || true
    fi
}

if [ "$FAST_DEPLOY" = true ]; then
    apply_fast_plan
fi

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

rebuild_frontend() {
    echo -e "${YELLOW}Rebuilding frontend...${NC}"
    cd "$TARGET_DIR/frontend"

    if [ -d ".next" ]; then
        chown -R svr:svr .next 2>/dev/null || true
    fi

    local req_hash
    req_hash="$(sha256sum package-lock.json 2>/dev/null | awk '{print $1}' || true)"
    local cached_req_hash=""
    if [ -f "$DEPLOY_META_DIR/package-lock.sha256" ]; then
        cached_req_hash="$(cat "$DEPLOY_META_DIR/package-lock.sha256")"
    fi

    if [ ! -d "node_modules" ] || [ "$req_hash" != "$cached_req_hash" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        sudo -u svr npm ci --prefer-offline --no-audit --no-fund
        echo "$req_hash" > "$DEPLOY_META_DIR/package-lock.sha256"
        chown svr:svr "$DEPLOY_META_DIR/package-lock.sha256"
    else
        echo -e "${GREEN}Skipping npm install (package-lock.json unchanged)${NC}"
    fi

    echo -e "${YELLOW}Building Next.js application...${NC}"
    # Next + PWA + Sentry often exceeds Node's default ~2GB heap on this app.
    sudo -u svr env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}" npm run build

    echo -e "${YELLOW}Preparing standalone server assets...${NC}"
    cp -r .next/static .next/standalone/.next/static
    cp -r public .next/standalone/public
    chown -R svr:svr .next/standalone

    echo -e "${GREEN}✓ Frontend rebuilt!${NC}"
    echo ""
}

rebuild_backend() {
    echo -e "${YELLOW}Rebuilding backend...${NC}"
    cd "$TARGET_DIR"

    if [ ! -d "venv" ]; then
        echo -e "${RED}Python virtualenv not found at $TARGET_DIR/venv${NC}"
        exit 1
    fi

    source venv/bin/activate

    local req_hash
    req_hash="$(sha256sum requirements.txt 2>/dev/null | awk '{print $1}' || true)"
    local cached_req_hash=""
    if [ -f "$DEPLOY_META_DIR/requirements.sha256" ]; then
        cached_req_hash="$(cat "$DEPLOY_META_DIR/requirements.sha256")"
    fi

    local install_deps=false
    if [ "$REQUIREMENTS_CHANGED" = true ] || [ "$req_hash" != "$cached_req_hash" ]; then
        install_deps=true
    fi

    if [ "$FAST_DEPLOY" = false ]; then
        install_deps=true
    fi

    if [ "$install_deps" = true ]; then
        echo -e "${YELLOW}Installing Python dependencies...${NC}"
        pip install -q -r requirements.txt
        echo "$req_hash" > "$DEPLOY_META_DIR/requirements.sha256"
        chown svr:svr "$DEPLOY_META_DIR/requirements.sha256"
    else
        echo -e "${GREEN}Skipping pip install (requirements.txt unchanged)${NC}"
    fi

    echo -e "${YELLOW}Running database migrations...${NC}"
    python manage.py migrate --noinput

    local run_collectstatic=false
    if [ "$FAST_DEPLOY" = false ] || [ "$STATIC_SOURCES_CHANGED" = true ] || [ "$install_deps" = true ]; then
        run_collectstatic=true
    fi

    if [ "$run_collectstatic" = true ]; then
        echo -e "${YELLOW}Collecting static files...${NC}"
        python manage.py collectstatic --noinput
    else
        echo -e "${GREEN}Skipping collectstatic (no static/migration asset changes detected)${NC}"
    fi

    deactivate

    echo -e "${GREEN}✓ Backend rebuilt!${NC}"
    echo ""
}

if [ "$REBUILD_FRONTEND" = true ]; then
    rebuild_frontend
fi

if [ "$REBUILD_BACKEND" = true ]; then
    rebuild_backend
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

    services=(svr svr-nextjs svr-celery svr-celery-qbo svr-celerybeat nginx)
    if [ "$FAST_DEPLOY" = true ]; then
        services=()
        if [ "$REBUILD_BACKEND" = true ] || [ "$BACKEND_CHANGED" = true ]; then
            services+=(svr svr-celery svr-celery-qbo svr-celerybeat)
        fi
        if [ "$REBUILD_FRONTEND" = true ] || [ "$FRONTEND_CHANGED" = true ]; then
            services+=(svr-nextjs)
        fi
        if [ ${#services[@]} -eq 0 ]; then
            services=(svr svr-nextjs)
        fi
    fi

    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            echo -e "${BLUE}  → Restarting $service...${NC}"
            systemctl restart "$service"
        fi
    done

    echo -e "${GREEN}✓ Services restarted!${NC}"
    echo ""
fi

write_deployed_commit

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${BLUE}Service Status:${NC}"
for service in svr svr-nextjs svr-celery svr-celery-qbo svr-celerybeat nginx; do
    if systemctl is-active "$service" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $service"
    else
        echo -e "  ${RED}✗${NC} $service"
    fi
done
