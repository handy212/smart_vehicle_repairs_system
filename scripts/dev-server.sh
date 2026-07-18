#!/bin/bash

###############################################################################
# Development Server Startup Script
# Starts Django backend and Next.js frontend in development mode
# Usage: bash scripts/dev-server.sh
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Ports (different from production to avoid conflicts)
DJANGO_PORT=8001
NEXTJS_PORT=3001
DJANGO_BIND_ADDRESS="${DJANGO_BIND_ADDRESS:-127.0.0.1}"
# Listen on all interfaces so Windows/host can reach WSL via 172.x (API still reached via Next proxy).
NEXTJS_BIND_ADDRESS="${NEXTJS_BIND_ADDRESS:-0.0.0.0}"
PUBLIC_HOST="${PUBLIC_HOST:-${DJANGO_HOST:-localhost}}"

# Virtualenv settings
# Use a dedicated dev venv so we don't conflict with the production venv under /var/www/svr
VENV_DIR="${VENV_DIR:-$BACKEND_DIR/venv-dev}"
if [ -z "${PYTHON_BIN:-}" ]; then
    if command -v python3.11 >/dev/null 2>&1; then
        PYTHON_BIN="python3.11"
    elif command -v python3.12 >/dev/null 2>&1; then
        PYTHON_BIN="python3.12"
    else
        PYTHON_BIN="python3"
    fi
fi
FRONTEND_PREWARM_ROUTES="${FRONTEND_PREWARM_ROUTES:-/ /login /dashboard}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Development Server${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Backend bind:${NC} $DJANGO_BIND_ADDRESS:$DJANGO_PORT"
echo -e "${BLUE}Frontend bind:${NC} $NEXTJS_BIND_ADDRESS:$NEXTJS_PORT"
echo -e "${BLUE}Public host:${NC} $PUBLIC_HOST"
echo ""

# Check if .env.development exists
if [ ! -f "$PROJECT_DIR/.env.development" ]; then
    echo -e "${YELLOW}Creating .env.development from template...${NC}"
    cat > "$PROJECT_DIR/.env.development" << 'EOF'
# Development Environment
DJANGO_ENVIRONMENT=development
DEBUG=True
SECRET_KEY=dev-secret-key-change-in-production-$(date +%s)

# Allowed hosts for development
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

# Database - using system PostgreSQL with production credentials
# Note: Password is URL-encoded (special characters: -Adeline17.@@ becomes -Adeline17.%40%40)
# For development, using separate database 'aap_dev' to avoid conflicts with production
DATABASE_URL=postgresql://aap:-Adeline17.%40%40@localhost:5432/aap_dev

# Redis - using system Redis
REDIS_URL=redis://localhost:6379/1

# Frontend API URL (matches development backend port)
NEXT_PUBLIC_API_URL=http://localhost:8001/api

# CORS - allow localhost for development
CORS_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
EOF
    echo -e "${GREEN}✓ Created .env.development${NC}"
    echo ""
fi

# IMPORTANT: Do NOT overwrite an existing .env (it may contain real secrets like PAYSTACK keys).
# Only create .env from .env.development if .env does not exist.
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}Creating .env from .env.development for development...${NC}"
    cp "$PROJECT_DIR/.env.development" "$PROJECT_DIR/.env"
    echo -e "${GREEN}✓ .env created for development${NC}"
    echo ""
else
    echo -e "${GREEN}✓ Using existing .env (not overwriting)${NC}"
    echo -e "${YELLOW}If Paystack keys or other env vars changed, restart this script to reload them.${NC}"
    echo ""
fi

create_dev_venv() {
    local clear_flag="${1:-}"

    echo -e "${YELLOW}Creating Python virtual environment at: $VENV_DIR${NC}"
    cd "$BACKEND_DIR"
    $PYTHON_BIN -m venv $clear_flag "$VENV_DIR" || {
        echo -e "${RED}Failed to create virtual environment.${NC}"
        echo -e "${YELLOW}If you see 'No module named venv', install: sudo apt-get install python3-venv${NC}"
        exit 1
    }
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    echo -e "${YELLOW}Installing Python dependencies from requirements.txt...${NC}"
    pip install -r requirements.txt || {
        echo -e "${RED}Failed to install requirements.txt.${NC}"
        echo -e "${YELLOW}This project is pinned to Django 4.2.x and expects Python 3.11 for some wheels (e.g. contourpy==1.3.3).${NC}"
        echo -e "${YELLOW}Try: PYTHON_BIN=python3.11 bash scripts/dev-server.sh${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Virtual environment created and dependencies installed${NC}"
    echo ""
}

# Create / ensure dev virtual environment exists (matching repo requirements)
if [ -d "$VENV_DIR" ]; then
    VENV_PY_VERSION="$("$VENV_DIR/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")"
    VENV_PY_MAJOR="${VENV_PY_VERSION%%.*}"
    VENV_PY_MINOR="${VENV_PY_VERSION#*.}"
    if [ "$VENV_PY_MAJOR" -lt 3 ] || { [ "$VENV_PY_MAJOR" -eq 3 ] && [ "$VENV_PY_MINOR" -lt 11 ]; }; then
        echo -e "${YELLOW}Dev venv uses Python $VENV_PY_VERSION; recreating with $PYTHON_BIN (requires 3.11+)...${NC}"
        rm -rf "$VENV_DIR"
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    create_dev_venv
fi

if [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo -e "${YELLOW}Dev virtual environment is incomplete; recreating it: $VENV_DIR${NC}"
    create_dev_venv "--clear"
fi

# Ensure dependencies are installed (in case a previous run was interrupted mid-install)
source "$VENV_DIR/bin/activate"
if ! python -c "import django" >/dev/null 2>&1; then
    echo -e "${YELLOW}Dev venv exists but dependencies are missing. Installing requirements.txt...${NC}"
    pip install --upgrade pip
    pip install -r requirements.txt || {
        echo -e "${RED}Failed to install requirements.txt into $VENV_DIR${NC}"
        echo -e "${YELLOW}Try: rm -rf $VENV_DIR && PYTHON_BIN=python3.11 bash scripts/dev-server.sh${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Check if node_modules exists in frontend
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd "$FRONTEND_DIR"
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
    echo ""
fi

# Prefer start-docker-dev.sh (works with Docker Desktop / docker.exe on WSL)
USE_DOCKER=false
if [ -f "$PROJECT_DIR/scripts/start-docker-dev.sh" ]; then
    echo -e "${BLUE}Starting Docker services (PostgreSQL & Redis)...${NC}"
    if bash "$PROJECT_DIR/scripts/start-docker-dev.sh" 2>&1; then
        USE_DOCKER=true
        echo -e "${GREEN}✓ Docker services started${NC}"
        echo ""
    else
        echo -e "${YELLOW}Warning: Failed to start Docker services${NC}"
        echo -e "${YELLOW}Run: bash scripts/start-docker-dev.sh${NC}"
        echo -e "${YELLOW}Assuming PostgreSQL and Redis are already running...${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}Docker helper not found. Skipping Docker services.${NC}"
    echo -e "${YELLOW}Assuming PostgreSQL and Redis are already running...${NC}"
    echo ""
fi

# Activate virtual environment and run migrations
echo -e "${BLUE}Setting up database...${NC}"
cd "$BACKEND_DIR"
source "$VENV_DIR/bin/activate"

# Use development settings explicitly
export DJANGO_SETTINGS_MODULE=config.settings.development

# Ensure frontend dev env points to the dev backend (avoid accidental calls to :8000)
# Ensure frontend dev env points to the dev backend (avoid accidental calls to :8000)
FRONTEND_ENV_FILE="$FRONTEND_DIR/.env.local"
echo -e "${YELLOW}Configuring frontend env: $FRONTEND_ENV_FILE${NC}"

# Extract Google Client ID from backend .env
GOOGLE_CLIENT_ID=$(grep "^GOOGLE_OAUTH_CLIENT_ID=" "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '\r')

cat > "$FRONTEND_ENV_FILE" << EOF
# Backend URL for Next.js rewrites (SSR/proxy target). Browser uses same-origin /api.
NEXT_PUBLIC_API_URL=http://127.0.0.1:$DJANGO_PORT/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
EOF
echo -e "${GREEN}✓ Frontend proxy target: http://127.0.0.1:$DJANGO_PORT/api (browser calls /api)${NC}"
echo ""

# Check if development database is reachable (uses DATABASE_URL from .env)
echo -e "${YELLOW}Checking database connection...${NC}"
if python -c "import django; django.setup(); from django.db import connection; connection.ensure_connection()" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${YELLOW}Database connection failed.${NC}"
    echo -e "${YELLOW}Ensure Docker Postgres is up (bash scripts/start-docker-dev.sh) and DATABASE_URL in .env points at it:${NC}"
    echo -e "${YELLOW}  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/smart_vehicle_repairs_dev${NC}"
    echo ""
fi

# Run migrations (--skip-checks: mapping_specs queries DB at import before tables exist)
echo -e "${YELLOW}Running database migrations...${NC}"
python scripts/patch_django52_libs.py
python manage.py migrate --skip-checks

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# Initialize roles, permissions, and system data
echo -e "${YELLOW}Initializing system data...${NC}"

# Initialize permissions and roles
echo -e "${YELLOW}  - Setting up roles and permissions...${NC}"
python manage.py init_permissions > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}    ✓ Roles and permissions initialized${NC}"
else
    echo -e "${YELLOW}    ⚠ Roles/permissions already exist or failed${NC}"
fi

echo -e "${YELLOW}  - Ensuring E2E test users...${NC}"
python scripts/create_e2e_user.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}    ✓ E2E users ready${NC}"
else
    echo -e "${YELLOW}    ⚠ E2E user seed skipped or failed${NC}"
fi

echo -e "${YELLOW}  - Initializing vehicle service types...${NC}"
python manage.py init_service_types > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}    ✓ Service types ready${NC}"
else
    echo -e "${YELLOW}    ⚠ Service types already exist or failed${NC}"
fi

# Initialize system settings
# echo -e "${YELLOW}  - Setting up system settings...${NC}"
# python manage.py init_settings > /dev/null 2>&1
# if [ $? -eq 0 ]; then
#     echo -e "${GREEN}    ✓ System settings initialized${NC}"
# else
#     echo -e "${YELLOW}    ⚠ Settings already exist or failed${NC}"
# fi

# Create email notification templates
echo -e "${YELLOW}  - Creating email templates...${NC}"
python manage.py create_all_email_templates > /dev/null 2>&1
python manage.py setup_invoice_email_templates > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}    ✓ Email templates created${NC}"
else
    echo -e "${YELLOW}    ⚠ Email templates already exist or failed${NC}"
fi

# Create inspection templates
# echo -e "${YELLOW}  - Creating inspection templates...${NC}"
# python manage.py create_inspection_templates > /dev/null 2>&1
# if [ $? -eq 0 ]; then
#     echo -e "${GREEN}    ✓ Inspection templates created${NC}"
# else
#     echo -e "${YELLOW}    ⚠ Inspection templates already exist or failed${NC}"
# fi

# Seed AA membership packages (subscription packages)
# echo -e "${YELLOW}  - Seeding AA membership packages...${NC}"
# python manage.py seed_aa_membership > /dev/null 2>&1
# if [ $? -eq 0 ]; then
#     echo -e "${GREEN}    ✓ AA membership packages seeded${NC}"
# else
#     echo -e "${YELLOW}    ⚠ AA packages already exist or failed${NC}"
# fi

# echo -e "${GREEN}✓ System initialization complete${NC}"
# echo ""

# Create superuser if it doesn't exist (optional)
echo -e "${BLUE}Backend:${NC} http://$PUBLIC_HOST:$DJANGO_PORT"
echo -e "${BLUE}Frontend:${NC} http://$PUBLIC_HOST:$NEXTJS_PORT"
echo -e "${BLUE}Admin:${NC} http://$PUBLIC_HOST:$DJANGO_PORT/admin"
echo ""
echo -e "${YELLOW}Starting servers...${NC}"
echo -e "${YELLOW}(Press Ctrl+C to stop all servers)${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down servers...${NC}"
    kill $DJANGO_PID $NEXTJS_PID $CELERY_WORKER_PID $CELERY_BEAT_PID 2>/dev/null || true
    wait $DJANGO_PID $NEXTJS_PID $CELERY_WORKER_PID $CELERY_BEAT_PID 2>/dev/null || true
    echo -e "${GREEN}✓ Servers stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start Django development server
echo -e "${GREEN}Starting Django backend on port $DJANGO_PORT...${NC}"
cd "$BACKEND_DIR"
export DJANGO_SETTINGS_MODULE=config.settings.development
source "$VENV_DIR/bin/activate"
python manage.py runserver "$DJANGO_BIND_ADDRESS:$DJANGO_PORT" > /tmp/django-dev.log 2>&1 &
DJANGO_PID=$!

# Wait a moment for Django to start
sleep 3

# Start Next.js development server
echo -e "${GREEN}Starting Next.js frontend on port $NEXTJS_PORT...${NC}"
cd "$FRONTEND_DIR"
NEXT_DEV_ARGS=(dev --hostname "$NEXTJS_BIND_ADDRESS" --port "$NEXTJS_PORT")
if [ "${USE_TURBOPACK:-1}" = "1" ]; then
    NEXT_DEV_ARGS=(dev --turbo --hostname "$NEXTJS_BIND_ADDRESS" --port "$NEXTJS_PORT")
else
    NEXT_DEV_ARGS=(dev --webpack --hostname "$NEXTJS_BIND_ADDRESS" --port "$NEXTJS_PORT")
fi
NEXT_PUBLIC_API_URL="http://127.0.0.1:$DJANGO_PORT/api" npx next "${NEXT_DEV_ARGS[@]}" > /tmp/nextjs-dev.log 2>&1 &
NEXTJS_PID=$!

# Start Celery Worker
echo -e "${GREEN}Starting Celery Worker...${NC}"
cd "$BACKEND_DIR"
source "$VENV_DIR/bin/activate"
celery -A config worker -l info -Q qbo,celery -n dev@%h > /tmp/celery-worker.log 2>&1 &
CELERY_WORKER_PID=$!

# Start Celery Beat
echo -e "${GREEN}Starting Celery Beat...${NC}"
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler > /tmp/celery-beat.log 2>&1 &
CELERY_BEAT_PID=$!

prewarm_frontend() {
    local base_url="http://127.0.0.1:$NEXTJS_PORT"
    local route

    echo -e "${YELLOW}Pre-warming frontend routes...${NC}"

    for _ in $(seq 1 60); do
        if curl -fsS -o /dev/null "$base_url/login" 2>/dev/null; then
            break
        fi
        sleep 1
    done

    for route in $FRONTEND_PREWARM_ROUTES; do
        curl -fsS -o /dev/null "$base_url$route" >/dev/null 2>&1 || true
    done

    echo -e "${GREEN}✓ Frontend warm-up complete${NC}"
}

prewarm_frontend

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Development servers are running!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Backend API:  ${GREEN}http://$PUBLIC_HOST:$DJANGO_PORT${NC}"
echo -e "Frontend:     ${GREEN}http://$PUBLIC_HOST:$NEXTJS_PORT${NC}"
echo -e "Django Admin: ${GREEN}http://$PUBLIC_HOST:$DJANGO_PORT/admin${NC}"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo -e "  Django: tail -f /tmp/django-dev.log"
echo -e "  Next.js: tail -f /tmp/nextjs-dev.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Wait for all processes
wait $DJANGO_PID $NEXTJS_PID $CELERY_WORKER_PID $CELERY_BEAT_PID
