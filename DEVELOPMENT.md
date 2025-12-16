# Development Setup Guide

This guide will help you set up a local development environment for testing features before deploying to production.

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker and Docker Compose (for PostgreSQL and Redis)
- Git

## Quick Start

### 1. Start Development Server

```bash
cd /opt/smart_vehicle_repairs_system
bash scripts/dev-server.sh
```

This will:
- Set up Python virtual environment (if needed)
- Install dependencies
- Start Docker services (PostgreSQL & Redis)
- Run database migrations
- Start Django backend on `http://localhost:8001`
- Start Next.js frontend on `http://localhost:3001`

### 2. Access the Application

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8001/api
- **Django Admin**: http://localhost:8001/admin

### 3. Stop Development Server

```bash
bash scripts/dev-stop.sh
```

Or press `Ctrl+C` in the terminal where the dev server is running.

## Manual Setup (Alternative)

### Step 1: Start Docker Services

```bash
docker-compose -f docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL on port **5433** (to avoid conflict with production on 5432)
- Redis on port **6379**

### Step 2: Set Up Backend

```bash
cd /opt/smart_vehicle_repairs_system

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.development .env
# Edit .env if needed

# Run migrations
python manage.py migrate

# Create superuser (optional)
python manage.py createsuperuser
```

### Step 3: Set Up Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy development environment file if needed
cp .env.development .env.local
```

### Step 4: Start Servers

**Terminal 1 - Django Backend:**
```bash
cd /opt/smart_vehicle_repairs_system
source .venv/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.development
python manage.py runserver 8001
```

**Terminal 2 - Next.js Frontend:**
```bash
cd /opt/smart_vehicle_repairs_system/frontend
PORT=3001 npm run dev
```

## Environment Configuration

### Development Environment Variables

The development server uses `.env.development` which includes:

- `DEBUG=True` - Enable Django debug mode
- `DJANGO_ENVIRONMENT=development` - Use development settings
- `DATABASE_URL` - Points to dev database (port 5433)
- `REDIS_URL` - Points to dev Redis
- `NEXT_PUBLIC_API_URL=http://localhost:8001/api` - Frontend API URL

### Database

Development uses a **separate database** (`smart_vehicle_repairs_dev`) to avoid conflicts with production data.

**Important:** Production database is on port 5432, development uses port 5433.

## Development Features

- **Hot Reload**: Both Django and Next.js automatically reload on code changes
- **Debug Toolbar**: Django Debug Toolbar enabled in development
- **Console Email**: Emails are printed to console instead of being sent
- **Verbose Logging**: More detailed logs for debugging
- **CORS Enabled**: All localhost origins allowed

## Development Workflow

### Testing New Features

1. **Start Development Server**
   ```bash
   bash scripts/dev-server.sh
   ```

2. **Make Your Changes**
   - Edit files in `/opt/smart_vehicle_repairs_system`
   - Changes automatically reload in development mode

3. **Test Thoroughly**
   - Test all affected features
   - Check browser console for errors
   - Verify API endpoints work correctly

4. **Stop Development Server**
   ```bash
   bash scripts/dev-stop.sh
   ```

5. **Deploy to Production** (when ready)
   ```bash
   sudo bash deploy/deploy.sh --all
   ```

## Useful Commands

### Database Management

```bash
# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Access Django shell
python manage.py shell

# Reset database (⚠️ deletes all data)
python manage.py flush
```

### Frontend Commands

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Run tests
npm run test
```

### Docker Commands

```bash
# Start services
docker-compose -f docker-compose.dev.yml up -d

# Stop services
docker-compose -f docker-compose.dev.yml down

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Reset database (⚠️ deletes all data)
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

## Troubleshooting

### Port Already in Use

If port 8001 or 3001 is already in use:

```bash
# Find process using port 8001
lsof -ti:8001

# Kill the process
kill $(lsof -ti:8001)

# Or modify the ports in scripts/dev-server.sh
# Edit DJANGO_PORT and NEXTJS_PORT variables
```

### Database Connection Issues

- Ensure Docker services are running: `docker-compose -f docker-compose.dev.yml ps`
- Check PostgreSQL is accessible: `docker exec smart_vehicle_postgres_dev pg_isready -U postgres`
- Verify `DATABASE_URL` in `.env` points to port 5433

### Module Not Found Errors

```bash
# Backend
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### Migration Issues

```bash
# Reset migrations (⚠️ use with caution)
python manage.py migrate --fake-initial
python manage.py migrate
```

## Differences from Production

| Aspect | Development | Production |
|--------|------------|------------|
| **Backend Port** | 8001 | 80/443 (via nginx) |
| **Frontend Port** | 3001 | 80/443 (via nginx) |
| **Database Port** | 5433 | 5432 |
| **Database Name** | `smart_vehicle_repairs_dev` | `smart_vehicle_repairs` |
| **Debug Mode** | Enabled | Disabled |
| **Auto-reload** | Enabled | Disabled |
| **Hot Reload** | Enabled | Disabled |
| **Logging** | Verbose | Production level |

## Best Practices

1. **Always test in development first** before deploying
2. **Use separate database** - never use production database in development
3. **Commit working code** - only commit tested, working features
4. **Use meaningful commit messages** - describe what you changed and why
5. **Test edge cases** - don't just test the happy path
6. **Check logs** - monitor both Django and Next.js logs for errors

## Additional Resources

- Django Documentation: https://docs.djangoproject.com/
- Next.js Documentation: https://nextjs.org/docs
- React Query Documentation: https://tanstack.com/query/latest

