# Docker Deployment Guide

## Why Docker for Production?

### ✅ Advantages:
1. **Consistency** - Same environment everywhere (dev, staging, prod)
2. **Isolation** - Each service in its own container
3. **Easy Updates** - `docker-compose pull && docker-compose up -d`
4. **Scalability** - Easy to scale services horizontally
5. **Portability** - Run anywhere Docker runs
6. **Rollback** - Easy to revert to previous versions
7. **Resource Management** - Better resource allocation
8. **Simplified Setup** - No dependency conflicts

### ⚠️ Considerations:
- Requires Docker knowledge
- Additional overhead (minimal)
- Need to manage Docker volumes for data persistence
- Networking slightly more complex

### ✅ Verdict: **YES, Docker is excellent for production!**

---

## Prerequisites

### Install Docker & Docker Compose
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Add your user to docker group (optional)
sudo usermod -aG docker $USER
```

---

## Deployment Steps

### 1. Prepare Environment File
```bash
# Copy example to production
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Generate SECRET_KEY:**
```bash
python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```

**Example .env.production:**
```env
SECRET_KEY=your-generated-secret-key
ALLOWED_HOSTS=yourdomain.com,api.yourdomain.com
DB_PASSWORD=strong_database_password
REDIS_PASSWORD=strong_redis_password
API_URL=https://api.yourdomain.com/api
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

### 2. Update Nginx Configuration
```bash
nano deploy/nginx/default.conf
```
Update `yourdomain.com` and `api.yourdomain.com` with your actual domains.

### 3. Build and Start Services
```bash
# Build images
docker-compose build

# Start in background
docker-compose up -d

# Check status
docker-compose ps
```

### 4. Run Initial Setup
```bash
# Run migrations
docker-compose exec backend python manage.py migrate

# Initialize permissions
docker-compose exec backend python manage.py init_permissions

# Initialize settings
docker-compose exec backend python manage.py init_settings

# Create superuser
docker-compose exec backend python manage.py createsuperuser

# Collect static files
docker-compose exec backend python manage.py collectstatic --noinput
```

### 5. Setup SSL Certificate

**Option A: Let's Encrypt with Certbot**
```bash
# Install certbot
sudo apt install certbot

# Get certificates
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com

# Copy certificates to deploy/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deploy/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deploy/nginx/ssl/
sudo chown $USER:$USER deploy/nginx/ssl/*.pem

# Restart nginx
docker-compose restart nginx
```

**Option B: Use Cloudflare (easier!)**
- Point domain to server IP in Cloudflare
- Enable "Full (strict)" SSL in Cloudflare
- Cloudflare handles SSL automatically

---

## Management Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f celery
docker-compose logs -f nginx
```

### Restart Services
```bash
# All services
docker-compose restart

# Specific service
docker-compose restart backend
docker-compose restart frontend
```

### Stop/Start
```bash
docker-compose stop      # Stop all
docker-compose start     # Start all
docker-compose down      # Stop and remove containers
docker-compose up -d     # Start in background
```

### Access Container Shell
```bash
# Backend shell
docker-compose exec backend bash

# Database shell
docker-compose exec db psql -U svr_user -d svr_db

# Redis shell
docker-compose exec redis redis-cli
```

### Run Django Commands
```bash
# Any Django management command
docker-compose exec backend python manage.py <command>

# Examples:
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python manage.py shell
```

---

## Updates & Deployments

### Update Application
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Run migrations if needed
docker-compose exec backend python manage.py migrate

# Collect static files
docker-compose exec backend python manage.py collectstatic --noinput
```

### Zero-Downtime Deployment
```bash
# Build new images
docker-compose build

# Create new containers without stopping old ones
docker-compose up -d --no-deps --build backend

# Scale if needed
docker-compose up -d --scale backend=2
```

---

## Backup & Restore

### Database Backup
```bash
# Create backup
docker-compose exec db pg_dump -U svr_user svr_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Or use script
bash deploy/docker-backup.sh
```

### Restore Database
```bash
# Restore from backup
gunzip < backup_20241211_120000.sql.gz | docker-compose exec -T db psql -U svr_user -d svr_db
```

### Media Files Backup
```bash
# Backup media files
tar -czf media_backup_$(date +%Y%m%d_%H%M%S).tar.gz media/
```

---

## Monitoring

### Container Status
```bash
docker-compose ps
docker stats
```

### Health Checks
```bash
# Backend health
curl http://localhost:8000/api/health/

# Frontend health
curl http://localhost:3000/
```

### Resource Usage
```bash
docker stats
docker system df
```

---

## Scaling

### Scale Services
```bash
# Scale backend workers
docker-compose up -d --scale backend=3

# Scale celery workers
docker-compose up -d --scale celery=2
```

### Load Balancing
For multiple backend containers, Nginx automatically load balances.

---

## Production Optimization

### 1. Use Docker Volumes for Persistence
Already configured in `docker-compose.yml`:
- `postgres_data` - Database data
- `redis_data` - Redis data
- `static_volume` - Static files
- `./media` - Media files (bind mount)

### 2. Resource Limits
Add to each service in `docker-compose.yml`:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 512M
```

### 3. Logging
Configure log rotation in `/etc/docker/daemon.json`:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs backend

# Check configuration
docker-compose config

# Rebuild
docker-compose build --no-cache backend
```

### Database Connection Issues
```bash
# Check database is running
docker-compose ps db

# Test connection
docker-compose exec backend python manage.py check

# Check DATABASE_URL
docker-compose exec backend env | grep DATABASE
```

### Permission Issues
```bash
# Fix ownership
sudo chown -R 1000:1000 media/ logs/
```

### Out of Space
```bash
# Clean up old images/containers
docker system prune -a

# Remove unused volumes
docker volume prune
```

---

## Security Best Practices

1. **Use secrets for sensitive data** (Docker Swarm secrets or external secret management)
2. **Run containers as non-root** (already configured)
3. **Keep images updated**: `docker-compose pull && docker-compose up -d`
4. **Use specific image versions** (not `latest`)
5. **Limit container resources**
6. **Enable Docker Content Trust**: `export DOCKER_CONTENT_TRUST=1`
7. **Regular security scanning**: `docker scan svr_backend`

---

## Comparison: Traditional vs Docker

| Aspect | Traditional | Docker |
|--------|------------|--------|
| Setup Time | 2-4 hours | 30 minutes |
| Dependencies | Manual install | Automated |
| Updates | Complex | Simple (`docker-compose pull`) |
| Rollback | Difficult | Easy (change version) |
| Scaling | Manual | Easy (`--scale`) |
| Isolation | None | Full isolation |
| Portability | Server-specific | Works anywhere |
| Backup | Multiple steps | Container export |

---

## Quick Commands Cheatsheet

```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Restart service
docker-compose restart backend

# Update and restart
git pull && docker-compose up -d --build

# Django commands
docker-compose exec backend python manage.py <command>

# Database backup
docker-compose exec db pg_dump -U svr_user svr_db | gzip > backup.sql.gz

# Access container
docker-compose exec backend bash
```

---

## Recommended: Docker + Cloudflare

For the easiest production setup:
1. Deploy with Docker (this guide)
2. Use Cloudflare for:
   - DNS management
   - SSL/HTTPS (automatic)
   - DDoS protection
   - CDN (faster static files)
   - Rate limiting
   
With Cloudflare, you don't need to manage SSL certificates manually!

---

## Support

For Docker-specific issues:
- Docker docs: https://docs.docker.com/
- Docker Compose docs: https://docs.docker.com/compose/

