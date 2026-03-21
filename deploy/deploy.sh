#!/bin/bash

###############################################################################
# Automated Deployment Script
# Syncs changes from /opt/smart_vehicle_repairs_system to /var/www/svr
# Usage: sudo bash deploy/deploy.sh [--rebuild-frontend] [--rebuild-backend] [--restart]
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SOURCE_DIR="/opt/smart_vehicle_repairs_system"
TARGET_DIR="/var/www/svr"

# Parse command line arguments
REBUILD_FRONTEND=false
REBUILD_BACKEND=false
RESTART_SERVICES=false

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
        --all)
            REBUILD_FRONTEND=true
            REBUILD_BACKEND=true
            RESTART_SERVICES=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--rebuild-frontend] [--rebuild-backend] [--restart] [--all]"
            exit 1
            ;;
    esac
done

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Validate source directory
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}Source directory not found: $SOURCE_DIR${NC}"
    exit 1
fi

# Create target directory if it doesn't exist
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}Creating target directory: $TARGET_DIR${NC}"
    mkdir -p "$TARGET_DIR"
    chown -R svr:svr "$TARGET_DIR"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Automated Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}Source:${NC} $SOURCE_DIR"
echo -e "${GREEN}Target:${NC} $TARGET_DIR"
echo ""

# Backup production .env if it exists
if [ -f "$TARGET_DIR/.env" ]; then
    echo -e "${YELLOW}Backing up production .env file...${NC}"
    cp "$TARGET_DIR/.env" "$TARGET_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Use rsync to sync files efficiently
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
    --exclude='deploy/' \
    --exclude='Attached_image.png' \
    --delete \
    "$SOURCE_DIR/" "$TARGET_DIR/"

# Restore .env if it was backed up
if [ -f "$TARGET_DIR/.env.backup."* ]; then
    LATEST_ENV_BACKUP=$(ls -t "$TARGET_DIR/.env.backup."* | head -1)
    if [ -f "$LATEST_ENV_BACKUP" ]; then
        echo -e "${GREEN}Restoring production .env file...${NC}"
        mv "$LATEST_ENV_BACKUP" "$TARGET_DIR/.env"
    fi
fi

# Set correct ownership
echo -e "${GREEN}Setting file permissions...${NC}"
chown -R svr:svr "$TARGET_DIR"

# Ensure important directories exist and have correct permissions
mkdir -p "$TARGET_DIR/logs"
mkdir -p "$TARGET_DIR/media"
mkdir -p "$TARGET_DIR/static"
chown -R svr:svr "$TARGET_DIR/logs"
chown -R svr:svr "$TARGET_DIR/media"
chown -R svr:svr "$TARGET_DIR/static"

echo ""
echo -e "${GREEN}✓ Files synced successfully!${NC}"
echo ""

# Rebuild frontend if requested
if [ "$REBUILD_FRONTEND" = true ]; then
    echo -e "${YELLOW}Rebuilding frontend...${NC}"
    cd "$TARGET_DIR/frontend"
    
    # Fix .next directory permissions
    if [ -d ".next" ]; then
        chown -R svr:svr .next 2>/dev/null || true
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        sudo -u svr npm install
    fi
    
    # Build frontend
    echo -e "${YELLOW}Building Next.js application...${NC}"
    sudo -u svr npm run build
    
    echo -e "${GREEN}✓ Frontend rebuilt!${NC}"
    echo ""
fi

# Rebuild backend if requested
if [ "$REBUILD_BACKEND" = true ]; then
    echo -e "${YELLOW}Rebuilding backend...${NC}"
    cd "$TARGET_DIR"
    
    # Activate virtual environment if it exists
    if [ -d "venv" ]; then
        source venv/bin/activate
        
        # Install/update dependencies
        echo -e "${YELLOW}Installing Python dependencies...${NC}"
        pip install -q -r requirements.txt
        
        # Run migrations
        echo -e "${YELLOW}Running database migrations...${NC}"
        python manage.py migrate --noinput
        
        # Collect static files
        echo -e "${YELLOW}Collecting static files...${NC}"
        python manage.py collectstatic --noinput --clear

        # Initialize and seed system data
        echo -e "${YELLOW}Initializing system roles and permissions...${NC}"
        python manage.py init_permissions
        
        echo -e "${YELLOW}Initializing system settings...${NC}"
        python manage.py init_settings
        
        echo -e "${YELLOW}Seeding system modules...${NC}"
        python manage.py seed_modules
        
        echo -e "${YELLOW}Ensuring super-admin account exists...${NC}"
        python manage.py create_super_admin
        
        echo -e "${YELLOW}Initializing vehicle service types...${NC}"
        python manage.py init_service_types

        echo -e "${YELLOW}Seeding AA membership packages...${NC}"
        python manage.py seed_aa_membership

        echo -e "${YELLOW}Seeding HR leave types...${NC}"
        python manage.py seed_leave_types

        echo -e "${YELLOW}Populating comprehensive diagnostic code library...${NC}"
        python manage.py populate_comprehensive_code_library
        
        echo -e "${YELLOW}Syncing additional diagnostic codes from APIs...${NC}"
        python manage.py sync_code_library --limit 50
        
        echo -e "${YELLOW}Creating email notification templates...${NC}"
        python manage.py create_all_email_templates
        
        echo -e "${YELLOW}Setting up invoice email templates...${NC}"
        python manage.py setup_invoice_email_templates
        
        echo -e "${YELLOW}Creating vehicle inspection templates...${NC}"
        python manage.py create_inspection_templates
        
        deactivate
    fi
    
    echo -e "${GREEN}✓ Backend rebuilt!${NC}"
    echo ""
fi

# Restart services if requested
if [ "$RESTART_SERVICES" = true ]; then
    echo -e "${YELLOW}Restarting services...${NC}"
    
    # Restart Django
    if systemctl is-active --quiet svr.service; then
        echo -e "${BLUE}  → Restarting Django (svr.service)...${NC}"
        systemctl restart svr.service
    fi
    
    # Restart Next.js
    if systemctl is-active --quiet svr-nextjs.service; then
        echo -e "${BLUE}  → Restarting Next.js (svr-nextjs.service)...${NC}"
        systemctl restart svr-nextjs.service
    fi
    
    # Restart Celery
    if systemctl is-active --quiet svr-celery.service; then
        echo -e "${BLUE}  → Restarting Celery (svr-celery.service)...${NC}"
        systemctl restart svr-celery.service
    fi
    
    # Restart Celery Beat
    if systemctl is-active --quiet svr-celerybeat.service; then
        echo -e "${BLUE}  → Restarting Celery Beat (svr-celerybeat.service)...${NC}"
        systemctl restart svr-celerybeat.service
    fi
    
    echo -e "${GREEN}✓ Services restarted!${NC}"
    echo ""
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Show service status
echo -e "${BLUE}Service Status:${NC}"
systemctl is-active svr.service > /dev/null && echo -e "  ${GREEN}✓${NC} Django (svr.service)" || echo -e "  ${RED}✗${NC} Django (svr.service)"
systemctl is-active svr-nextjs.service > /dev/null && echo -e "  ${GREEN}✓${NC} Next.js (svr-nextjs.service)" || echo -e "  ${RED}✗${NC} Next.js (svr-nextjs.service)"
systemctl is-active svr-celery.service > /dev/null && echo -e "  ${GREEN}✓${NC} Celery (svr-celery.service)" || echo -e "  ${RED}✗${NC} Celery (svr-celery.service)"
systemctl is-active svr-celerybeat.service > /dev/null && echo -e "  ${GREEN}✓${NC} Celery Beat (svr-celerybeat.service)" || echo -e "  ${RED}✗${NC} Celery Beat (svr-celerybeat.service)"

