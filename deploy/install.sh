#!/bin/bash

###############################################################################
# Smart Vehicle Repairs System - Automated Installation Script
# This script automates the installation of dependencies and basic setup
# Run with: sudo bash deploy/install.sh
###############################################################################

set -e  # Exit on error

echo "=========================================="
echo "Smart Vehicle Repairs System Installation"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    echo -e "${RED}Cannot detect OS. This script supports Ubuntu/Debian.${NC}"
    exit 1
fi

echo -e "${GREEN}Detected OS: $OS $OS_VERSION${NC}"
echo ""

# Update system
echo -e "${YELLOW}[1/10] Updating system packages...${NC}"
apt update && apt upgrade -y

# Install base packages
echo -e "${YELLOW}[2/10] Installing base packages...${NC}"
apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    postgresql \
    postgresql-contrib \
    redis-server \
    nginx \
    git \
    curl \
    wget \
    build-essential \
    libpq-dev \
    python3-dev \
    certbot \
    python3-certbot-nginx \
    supervisor \
    ufw \
    software-properties-common

# Install Node.js
echo -e "${YELLOW}[3/10] Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# Verify installations
echo -e "${YELLOW}[4/10] Verifying installations...${NC}"
python3 --version
node --version
npm --version
psql --version
redis-server --version
nginx -v

# Create application user
echo -e "${YELLOW}[5/10] Creating application user...${NC}"
if ! id "svr" &>/dev/null; then
    useradd --system --home-dir /var/www/svr --create-home svr
    echo -e "${GREEN}User 'svr' created${NC}"
else
    echo -e "${GREEN}User 'svr' already exists${NC}"
fi

# Create application directory
echo -e "${YELLOW}[6/10] Creating application directories...${NC}"
mkdir -p /var/www/svr
mkdir -p /var/www/svr/logs
mkdir -p /var/www/svr/media
mkdir -p /var/backups/svr
chown -R svr:svr /var/www/svr
chown -R svr:svr /var/backups/svr

# Configure PostgreSQL
echo -e "${YELLOW}[7/10] Configuring PostgreSQL...${NC}"
systemctl start postgresql
systemctl enable postgresql

# Configure Redis
echo -e "${YELLOW}[8/10] Configuring Redis...${NC}"
systemctl start redis-server
systemctl enable redis-server

# Configure Firewall
echo -e "${YELLOW}[9/10] Configuring firewall...${NC}"
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Install Gunicorn globally (for systemd service)
echo -e "${YELLOW}[10/10] Installing Gunicorn...${NC}"
pip3 install --break-system-packages gunicorn || echo "Gunicorn will be installed in virtual environment"

echo ""
echo -e "${GREEN}=========================================="
echo -e "Installation Complete!"
echo -e "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Clone/upload your application to /var/www/svr"
echo "2. Setup database: sudo bash deploy/setup-database.sh"
echo "3. Setup application: sudo bash deploy/setup-app.sh"
echo "4. Configure services: sudo bash deploy/setup-services.sh"
echo ""
echo "Or run the complete setup:"
echo "  sudo bash deploy/setup-complete.sh"
echo ""

