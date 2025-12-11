# Deployment Automation Scripts

This directory contains automated scripts to help deploy the Smart Vehicle Repairs System to production.

## Quick Start

### Option 1: Complete Automated Setup
```bash
sudo bash deploy/setup-complete.sh
```
This runs all setup steps interactively.

### Option 2: Step-by-Step Setup

1. **Install dependencies:**
   ```bash
   sudo bash deploy/install.sh
   ```

2. **Setup database:**
   ```bash
   sudo bash deploy/setup-database.sh
   ```

3. **Setup application:**
   ```bash
   sudo bash deploy/setup-app.sh
   ```

4. **Setup services:**
   ```bash
   sudo bash deploy/setup-services.sh
   ```

## Prerequisites

- Ubuntu 20.04/22.04 LTS (or similar Debian-based Linux)
- Root/sudo access
- Internet connection

## What the Scripts Do

### `install.sh`
- Updates system packages
- Installs Python, Node.js, PostgreSQL, Redis, Nginx
- Creates application user
- Configures firewall

### `setup-database.sh`
- Creates PostgreSQL database
- Creates database user
- Sets up permissions

### `setup-app.sh`
- Creates Python virtual environment
- Installs Python dependencies
- Runs database migrations
- Initializes permissions and settings
- Collects static files
- Sets up frontend (npm install)

### `setup-services.sh`
- Creates systemd service files for:
  - Gunicorn (Django)
  - Celery worker
  - Celery beat
  - Next.js (frontend)
- Enables services to start on boot

## Manual Steps After Running Scripts

1. **Create superuser:**
   ```bash
   sudo -u svr /var/www/svr/venv/bin/python manage.py createsuperuser
   ```

2. **Edit .env file:**
   ```bash
   sudo nano /var/www/svr/.env
   ```
   Update all environment variables with your production values.

3. **Configure Nginx:**
   - Copy Nginx config from `DEPLOYMENT_GUIDE.md`
   - Or use: `sudo bash deploy/setup-nginx.sh` (if available)

4. **Setup SSL:**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
   ```

5. **Start services:**
   ```bash
   sudo systemctl start svr svr-celery svr-celerybeat svr-nextjs
   ```

## Verification

Check service status:
```bash
sudo systemctl status svr
sudo systemctl status svr-celery
sudo systemctl status svr-celerybeat
sudo systemctl status svr-nextjs
```

View logs:
```bash
sudo journalctl -u svr -f
sudo journalctl -u svr-celery -f
```

## Troubleshooting

If a script fails:
1. Check the error message
2. Fix the issue manually
3. Re-run the script (they're idempotent - safe to run multiple times)

## Notes

- Scripts are idempotent (safe to run multiple times)
- Scripts will prompt for required information
- All sensitive data should be stored in `.env` file
- Make sure to backup your `.env` file securely

