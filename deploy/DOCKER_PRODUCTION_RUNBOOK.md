# Docker Production Runbook

This runbook is for the Docker Compose deployment of Smart Vehicle Repairs System.

Production stack:

- Django backend/API
- Next.js frontend
- PostgreSQL
- Redis
- Celery worker
- Celery beat
- Internal Nginx reverse proxy
- External Nginx Proxy Manager for public HTTPS

## 1. Server Setup

Run on the production server:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose git
sudo systemctl enable --now docker
```

Clone the application:

```bash
cd /opt
sudo git clone <YOUR_GITHUB_REPO_URL> smart_vehicle_repairs_system
sudo chown -R $USER:$USER smart_vehicle_repairs_system
cd /opt/smart_vehicle_repairs_system
```

## 2. Environment File

Create `.env`:

```bash
cp .env.production.example .env
nano .env
```

Required production values:

```env
DJANGO_ENVIRONMENT=production
DEBUG=False
SECRET_KEY=<LONG_RANDOM_SECRET>

ALLOWED_HOSTS=aap.safetracksystems.com,api.safetracksystems.com,localhost,127.0.0.1

DB_NAME=svr_db
DB_USER=svr_user
DB_PASSWORD=<STRONG_DATABASE_PASSWORD>
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}

REDIS_PASSWORD=<STRONG_REDIS_PASSWORD>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0

API_URL=https://api.safetracksystems.com/api
FRONTEND_BASE_URL=https://aap.safetracksystems.com
CORS_ALLOWED_ORIGINS=https://aap.safetracksystems.com
CSRF_TRUSTED_ORIGINS=https://aap.safetracksystems.com,https://api.safetracksystems.com

SECURE_SSL_REDIRECT=False
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

`SECURE_SSL_REDIRECT=False` is used because HTTPS is handled by Nginx Proxy Manager before traffic reaches Docker.

## 3. Internal Nginx For Nginx Proxy Manager

Use HTTP only inside Docker when Nginx Proxy Manager handles HTTPS.

Replace `deploy/nginx/default.conf` with:

```nginx
upstream backend {
    server backend:8000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name aap.safetracksystems.com;

    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }
}

server {
    listen 80;
    server_name api.safetracksystems.com;

    client_max_body_size 100M;

    location /static/ {
        alias /var/www/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /media/ {
        alias /var/www/media/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_redirect off;

        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

In `docker-compose.yml`, publish only HTTP from the internal Nginx when using Nginx Proxy Manager:

```yaml
ports:
  - "80:80"
```

## 4. Nginx Proxy Manager Hosts

Create two proxy hosts in Nginx Proxy Manager.

Frontend:

```text
Domain: aap.safetracksystems.com
Scheme: http
Forward Hostname/IP: <DOCKER_SERVER_IP>
Forward Port: 80
Websockets: enabled
SSL: enabled
Force SSL: enabled
```

Backend:

```text
Domain: api.safetracksystems.com
Scheme: http
Forward Hostname/IP: <DOCKER_SERVER_IP>
Forward Port: 80
Websockets: enabled
SSL: enabled
Force SSL: enabled
```

Both domains use port `80` in Nginx Proxy Manager because routing is based on the domain name.

## 5. Host Folder Permissions

The backend container runs as UID `1000`. Prepare writable host folders:

```bash
cd /opt/smart_vehicle_repairs_system

sudo mkdir -p logs media
sudo touch logs/production.log logs/error.log logs/security.log
sudo chown -R 1000:1000 logs media
sudo chmod -R u+rwX,g+rwX logs media
```

## 6. Start The Stack

Validate Compose:

```bash
docker compose config
```

Build and start:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs --tail=120 backend
```

Expected core services:

```text
svr_backend      healthy
svr_frontend     healthy
svr_db           healthy
svr_redis        healthy
svr_nginx        Up
svr_celery       Up
svr_celerybeat   Up
```

Celery and Celery Beat should have healthchecks disabled in `docker-compose.yml` because they do not serve HTTP:

```yaml
healthcheck:
  disable: true
```

## 7. Create First Admin User

Create the first login user:

```bash
docker compose exec backend python manage.py createsuperuser
```

Verify users:

```bash
docker compose exec backend python manage.py shell -c "from django.contrib.auth import get_user_model; User=get_user_model(); [print(u.id, u.email, u.username, u.role, u.is_staff, u.is_superuser) for u in User.objects.all()]"
```

Verify admin settings permission:

```bash
docker compose exec backend python manage.py shell -c "from django.contrib.auth import get_user_model; from apps.accounts.permissions import get_user_permissions; u=get_user_model().objects.get(email='<ADMIN_EMAIL>'); print(u.email, u.role, u.is_staff, u.is_superuser); print('manage_settings' in get_user_permissions(u))"
```

Promote the first admin user when needed:

```bash
docker compose exec backend python manage.py shell -c "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(email='<ADMIN_EMAIL>'); u.role='super-admin'; u.is_staff=True; u.is_superuser=True; u.save(); print('updated', u.email)"
```

After changing permissions or roles, log out of the UI, clear site data for `https://aap.safetracksystems.com`, and log in again.

## 8. Required Production Bootstrap Commands

Run these after first deployment. These are required production setup data, not demo data:

```bash
docker compose exec backend python manage.py init_settings
docker compose exec backend python manage.py init_permissions
docker compose exec backend python manage.py init_service_types
docker compose exec backend python manage.py create_inspection_templates
docker compose exec backend python manage.py create_all_email_templates
docker compose exec backend python manage.py setup_invoice_email_templates
docker compose exec backend python manage.py seed_leave_types
docker compose exec backend python manage.py populate_code_library
```

Run AA membership packages when the subscription membership module is used and an admin user exists:

```bash
docker compose exec backend python manage.py seed_aa_membership
```

Do not run demo or test seed commands in production:

```bash
# Do not run in production
docker compose exec backend python manage.py seed_demo_data
docker compose exec backend python manage.py seed_hr_demo
docker compose exec backend python manage.py seed_dev_data
docker compose exec backend python manage.py populate_diagnosis_test_data
docker compose exec backend python manage.py populate_inventory
```

## 9. Health Checks

Backend health:

```bash
curl http://localhost/api/health/
curl https://api.safetracksystems.com/api/health/
```

Container status:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs --tail=120 backend
docker compose logs --tail=120 frontend
docker compose logs --tail=120 celery
docker compose logs --tail=120 celerybeat
docker compose logs --tail=120 redis
docker compose logs --tail=120 db
docker compose logs --tail=120 nginx
```

Follow logs:

```bash
docker compose logs -f backend
```

## 10. Update Production From GitHub

Use this for normal code updates:

```bash
cd /opt/smart_vehicle_repairs_system
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=120 backend
```

This rebuilds changed images and recreates changed containers. It preserves database, Redis, static, logs, and media volumes.

## 11. Apply `.env` Changes

After changing `.env`, recreate containers so environment variables are reloaded:

```bash
docker compose up -d --force-recreate
docker compose ps
```

For backend-only environment changes:

```bash
docker compose up -d --force-recreate backend celery celerybeat
```

For frontend `API_URL` changes, rebuild the frontend because `NEXT_PUBLIC_API_URL` is used at build time:

```bash
docker compose up -d --build frontend nginx
```

## 12. Restart Without Rebuild

Restart all services:

```bash
docker compose restart
```

Restart one service:

```bash
docker compose restart backend
docker compose restart frontend
docker compose restart celery celerybeat
```

## 13. Avoid Destructive Commands

Normal production updates do not need:

```bash
docker compose down
```

Use `down` only when intentionally stopping the full stack:

```bash
docker compose down
```

Never use this in production unless deleting data is intentional:

```bash
docker compose down -v
```

`down -v` removes named volumes, including the database volume.

## 14. Common Fixes

### Logs Permission Error

Error:

```text
PermissionError: [Errno 13] Permission denied: '/app/logs/error.log'
```

Fix:

```bash
cd /opt/smart_vehicle_repairs_system
sudo mkdir -p logs media
sudo touch logs/production.log logs/error.log logs/security.log
sudo chown -R 1000:1000 logs media
sudo chmod -R u+rwX,g+rwX logs media
docker compose up -d --force-recreate backend celery celerybeat
```

### Backend Healthcheck Returns 400

Ensure `.env` includes local healthcheck hosts:

```env
ALLOWED_HOSTS=aap.safetracksystems.com,api.safetracksystems.com,localhost,127.0.0.1
```

Then recreate backend:

```bash
docker compose up -d --force-recreate backend
```

### Redis Fails Healthcheck

Ensure the Redis service has this environment and healthcheck:

```yaml
environment:
  - REDIS_PASSWORD=${REDIS_PASSWORD:-changeme}
healthcheck:
  test: ["CMD-SHELL", "redis-cli -a \"$REDIS_PASSWORD\" ping | grep PONG"]
```

Restart:

```bash
docker compose up -d --force-recreate redis
```

### Settings Page Is Grayed Out

Run permissions:

```bash
docker compose exec backend python manage.py init_permissions
```

Verify the logged-in user has `manage_settings`:

```bash
docker compose exec backend python manage.py shell -c "from django.contrib.auth import get_user_model; from apps.accounts.permissions import get_user_permissions; u=get_user_model().objects.get(email='<ADMIN_EMAIL>'); print('manage_settings' in get_user_permissions(u))"
```

Log out, clear browser site data for `https://aap.safetracksystems.com`, and log in again.

### Invoice And Payment Email Template Notice

Run:

```bash
docker compose exec backend python manage.py setup_invoice_email_templates
```

## 15. Useful Admin URLs

Frontend:

```text
https://aap.safetracksystems.com
```

Backend API health:

```text
https://api.safetracksystems.com/api/health/
```

Django admin:

```text
https://api.safetracksystems.com/admin/
```
