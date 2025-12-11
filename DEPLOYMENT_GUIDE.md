# Production Deployment Guide

## Overview
This guide covers deploying the Smart Vehicle Repairs System to a production server. The application consists of:
- **Backend**: Django REST API (Python)
- **Frontend**: Next.js (Node.js/React)
- **Database**: PostgreSQL (recommended) or MySQL
- **Cache/Queue**: Redis (for caching and Celery)
- **Web Server**: Nginx (reverse proxy)
- **WSGI Server**: Gunicorn (Django)

---

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04/22.04 LTS (recommended) or similar Linux distribution
- **RAM**: Minimum 2GB (4GB+ recommended)
- **CPU**: 2+ cores recommended
- **Storage**: 20GB+ SSD
- **Python**: 3.10 or higher
- **Node.js**: 18.x or 20.x
- **PostgreSQL**: 13+ or MySQL 8.0+
- **Redis**: 6.0+
- **Nginx**: Latest stable

### Domain & SSL
- Domain name configured to point to server IP
- SSL certificate (Let's Encrypt recommended)

---

## Step 1: Server Setup

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Base Packages
```bash
sudo apt install -y \
    python3-pip \
    python3-venv \
    postgresql \
    postgresql-contrib \
    redis-server \
    nginx \
    git \
    curl \
    build-essential \
    libpq-dev \
    python3-dev \
    certbot \
    python3-certbot-nginx
```

### Install Node.js (via NodeSource)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Verify Installations
```bash
python3 --version  # Should be 3.10+
node --version     # Should be 18.x or 20.x
npm --version
postgresql --version
redis-server --version
nginx -v
```

---

## Step 2: Database Setup

### Create PostgreSQL Database
```bash
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE svr_db;
CREATE USER svr_user WITH PASSWORD 'your_secure_password_here';
ALTER ROLE svr_user SET client_encoding TO 'utf8';
ALTER ROLE svr_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE svr_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE svr_db TO svr_user;
\q
```

### Configure PostgreSQL
```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
# Set: listen_addresses = 'localhost'
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Ensure: local all all md5
sudo systemctl restart postgresql
```

---

## Step 3: Redis Setup

### Configure Redis
```bash
sudo nano /etc/redis/redis.conf
# Set: bind 127.0.0.1
# Set: requirepass your_redis_password (optional but recommended)
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

---

## Step 4: Application Setup

### Create Application User
```bash
sudo adduser --system --group --home /var/www/svr svr
sudo mkdir -p /var/www/svr
sudo chown svr:svr /var/www/svr
```

### Clone Repository
```bash
cd /var/www/svr
sudo -u svr git clone <your-repository-url> .
# Or upload files via SCP/SFTP
```

### Setup Python Environment
```bash
cd /var/www/svr
sudo -u svr python3 -m venv venv
sudo -u svr source venv/bin/activate
sudo -u svr pip install --upgrade pip
sudo -u svr pip install -r requirements.txt
```

### Setup Environment Variables
```bash
cd /var/www/svr
sudo -u svr nano .env
```

**Required Environment Variables:**
```env
# Django Environment
DJANGO_ENVIRONMENT=production
DEBUG=False
SECRET_KEY=your-very-long-random-secret-key-here
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com,api.yourdomain.com

# Database
DATABASE_URL=postgresql://svr_user:your_secure_password_here@localhost:5432/svr_db

# Redis
REDIS_URL=redis://localhost:6379/0

# Email Configuration
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# JWT Tokens
JWT_ACCESS_TOKEN_LIFETIME=60
JWT_REFRESH_TOKEN_LIFETIME=1440

# AWS S3 (Optional - for static/media files)
USE_S3=False
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=us-east-1

# SMS Configuration (Hubtel)
HUBTEL_CLIENT_ID=
HUBTEL_CLIENT_SECRET=
HUBTEL_FROM=
HUBTEL_SMS_ENABLED=True

# Firebase (Optional - for push notifications)
FIREBASE_CREDENTIALS_PATH=
FIREBASE_ENABLED=False
```

**Generate SECRET_KEY:**
```bash
python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```

### Run Migrations
```bash
cd /var/www/svr
sudo -u svr source venv/bin/activate
sudo -u svr python manage.py migrate
sudo -u svr python manage.py init_permissions
sudo -u svr python manage.py init_settings
sudo -u svr python manage.py createsuperuser
```

### Collect Static Files
```bash
cd /var/www/svr
sudo -u svr source venv/bin/activate
sudo -u svr python manage.py collectstatic --noinput
```

### Set Permissions
```bash
sudo chown -R svr:svr /var/www/svr
sudo chmod -R 755 /var/www/svr
sudo chmod -R 775 /var/www/svr/media
sudo chmod -R 775 /var/www/svr/logs
```

---

## Step 5: Frontend Setup

### Build Frontend
```bash
cd /var/www/svr/frontend
sudo -u svr npm install
sudo -u svr npm run build
```

### Create .env.production
```bash
cd /var/www/svr/frontend
sudo -u svr nano .env.production
```

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NODE_ENV=production
```

### Build Production Bundle
```bash
cd /var/www/svr/frontend
sudo -u svr npm run build
```

---

## Step 6: Gunicorn Setup

### Install Gunicorn
```bash
cd /var/www/svr
sudo -u svr source venv/bin/activate
sudo -u svr pip install gunicorn
```

### Create Gunicorn Service
```bash
sudo nano /etc/systemd/system/svr.service
```

```ini
[Unit]
Description=Smart Vehicle Repairs Gunicorn daemon
After=network.target

[Service]
User=svr
Group=svr
WorkingDirectory=/var/www/svr
Environment="PATH=/var/www/svr/venv/bin"
ExecStart=/var/www/svr/venv/bin/gunicorn \
    --access-logfile - \
    --workers 3 \
    --bind unix:/var/www/svr/svr.sock \
    config.wsgi:application

[Install]
WantedBy=multi-user.target
```

### Start Gunicorn
```bash
sudo systemctl daemon-reload
sudo systemctl start svr
sudo systemctl enable svr
sudo systemctl status svr
```

---

## Step 7: Celery Setup

### Create Celery Worker Service
```bash
sudo nano /etc/systemd/system/svr-celery.service
```

```ini
[Unit]
Description=Smart Vehicle Repairs Celery Worker
After=network.target redis-server.service postgresql.service

[Service]
Type=forking
User=svr
Group=svr
WorkingDirectory=/var/www/svr
Environment="PATH=/var/www/svr/venv/bin"
EnvironmentFile=/var/www/svr/.env
ExecStart=/var/www/svr/venv/bin/celery -A config worker \
    --loglevel=info \
    --logfile=/var/www/svr/logs/celery.log \
    --pidfile=/var/www/svr/celerybeat.pid \
    --detach

[Install]
WantedBy=multi-user.target
```

### Create Celery Beat Service
```bash
sudo nano /etc/systemd/system/svr-celerybeat.service
```

```ini
[Unit]
Description=Smart Vehicle Repairs Celery Beat
After=network.target redis-server.service postgresql.service

[Service]
Type=forking
User=svr
Group=svr
WorkingDirectory=/var/www/svr
Environment="PATH=/var/www/svr/venv/bin"
EnvironmentFile=/var/www/svr/.env
ExecStart=/var/www/svr/venv/bin/celery -A config beat \
    --loglevel=info \
    --logfile=/var/www/svr/logs/celerybeat.log \
    --pidfile=/var/www/svr/celerybeat.pid \
    --detach \
    --scheduler django_celery_beat.schedulers:DatabaseScheduler

[Install]
WantedBy=multi-user.target
```

### Start Celery Services
```bash
sudo systemctl daemon-reload
sudo systemctl start svr-celery
sudo systemctl start svr-celerybeat
sudo systemctl enable svr-celery
sudo systemctl enable svr-celerybeat
```

---

## Step 8: Nginx Configuration

### Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/svr
```

```nginx
# Upstream for Django
upstream django {
    server unix:/var/www/svr/svr.sock fail_timeout=0;
}

# Frontend (Next.js)
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    root /var/www/svr/frontend/.next;
    index index.html;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Frontend static files
    location /_next/static {
        alias /var/www/svr/frontend/.next/static;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # Frontend pages
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    client_max_body_size 100M;
    
    # Static files
    location /static/ {
        alias /var/www/svr/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Media files
    location /media/ {
        alias /var/www/svr/media/;
        expires 7d;
        add_header Cache-Control "public";
    }
    
    # API routes
    location /api/ {
        proxy_pass http://unix:/var/www/svr/svr.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
    
    # Admin routes
    location /admin/ {
        proxy_pass http://unix:/var/www/svr/svr.sock;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
}
```

### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/svr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Step 9: SSL Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
sudo certbot renew --dry-run
```

### Auto-renewal (already configured via cron)
```bash
sudo systemctl status certbot.timer
```

---

## Step 10: Run Next.js as Service (Production Mode)

### Create Next.js Service
```bash
sudo nano /etc/systemd/system/svr-nextjs.service
```

```ini
[Unit]
Description=Smart Vehicle Repairs Next.js
After=network.target

[Service]
Type=simple
User=svr
Group=svr
WorkingDirectory=/var/www/svr/frontend
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Start Next.js
```bash
sudo systemctl daemon-reload
sudo systemctl start svr-nextjs
sudo systemctl enable svr-nextjs
```

---

## Step 11: Firewall Configuration

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Step 12: Monitoring & Logs

### View Logs
```bash
# Django/Gunicorn logs
sudo journalctl -u svr -f

# Celery logs
sudo journalctl -u svr-celery -f
sudo journalctl -u svr-celerybeat -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Application logs
tail -f /var/www/svr/logs/production.log
tail -f /var/www/svr/logs/error.log
```

---

## Step 13: Backup Strategy

### Database Backup Script
```bash
sudo nano /usr/local/bin/svr-backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/svr"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -U svr_user svr_db | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Media files backup
tar -czf $BACKUP_DIR/media_$DATE.tar.gz -C /var/www/svr media/

# Keep only last 7 days
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

### Setup Cron Job
```bash
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/svr-backup.sh
```

---

## Step 14: Post-Deployment Checklist

- [ ] All environment variables set correctly
- [ ] Database migrations applied
- [ ] Static files collected
- [ ] Superuser created
- [ ] Permissions initialized
- [ ] Settings initialized
- [ ] Frontend built and running
- [ ] Gunicorn service running
- [ ] Celery workers running
- [ ] Celery beat running
- [ ] Nginx configured and running
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Backups configured
- [ ] Logs accessible
- [ ] Test API endpoints
- [ ] Test frontend pages
- [ ] Test email sending
- [ ] Test SMS (if configured)
- [ ] Monitor error logs

---

## Quick Commands Reference

### Restart Services
```bash
sudo systemctl restart svr
sudo systemctl restart svr-celery
sudo systemctl restart svr-celerybeat
sudo systemctl restart svr-nextjs
sudo systemctl restart nginx
```

### Check Service Status
```bash
sudo systemctl status svr
sudo systemctl status svr-celery
sudo systemctl status svr-celerybeat
sudo systemctl status svr-nextjs
sudo systemctl status nginx
```

### Update Application
```bash
cd /var/www/svr
sudo -u svr git pull
sudo -u svr source venv/bin/activate
sudo -u svr pip install -r requirements.txt
sudo -u svr python manage.py migrate
sudo -u svr python manage.py collectstatic --noinput
cd frontend
sudo -u svr npm install
sudo -u svr npm run build
sudo systemctl restart svr svr-nextjs
```

---

## Troubleshooting

### 502 Bad Gateway
- Check Gunicorn is running: `sudo systemctl status svr`
- Check socket permissions: `ls -l /var/www/svr/svr.sock`
- Check Nginx error log: `sudo tail -f /var/log/nginx/error.log`

### Static Files Not Loading
- Run: `python manage.py collectstatic --noinput`
- Check Nginx static file paths
- Check file permissions

### Database Connection Errors
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check DATABASE_URL in .env
- Test connection: `psql -U svr_user -d svr_db`

### Celery Not Processing Tasks
- Check Redis is running: `sudo systemctl status redis`
- Check Celery worker: `sudo systemctl status svr-celery`
- Check logs: `sudo journalctl -u svr-celery -f`

---

## Alternative: Docker Deployment

If you prefer Docker, see `docker-compose.prod.yml` (if available) for containerized deployment.

---

## Support

For issues or questions, refer to:
- Django documentation: https://docs.djangoproject.com/
- Next.js documentation: https://nextjs.org/docs
- Gunicorn documentation: https://docs.gunicorn.org/

