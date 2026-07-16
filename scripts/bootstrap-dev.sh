#!/bin/bash
# One-shot local dev bootstrap (Postgres + Redis via Docker, migrations, superuser)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Use sudo for docker if not in docker group
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    echo -e "${YELLOW}Using sudo for Docker. Add yourself to the docker group to skip this:${NC}"
    echo -e "${YELLOW}  sudo usermod -aG docker \$USER && newgrp docker${NC}"
    echo ""
  else
    echo -e "${RED}Docker is not running or not accessible.${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}Starting Postgres and Redis...${NC}"
bash "$SCRIPT_DIR/start-docker-dev.sh" 2>/dev/null || {
  $DOCKER start smart_vehicle_postgres_dev 2>/dev/null || \
    $DOCKER run -d --name smart_vehicle_postgres_dev \
      -e POSTGRES_DB=smart_vehicle_repairs_dev \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -p 5433:5432 \
      postgres:15

  $DOCKER start smart_vehicle_redis 2>/dev/null || \
    $DOCKER run -d --name smart_vehicle_redis \
      -p 6379:6379 \
      redis:7-alpine

  for i in $(seq 1 30); do
    $DOCKER exec smart_vehicle_postgres_dev pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 1
  done
}

# Point .env at Docker Postgres/Redis
grep -q '^DATABASE_URL=postgresql://' .env 2>/dev/null || {
  sed -i 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:postgres@localhost:5433/smart_vehicle_repairs_dev|' .env
  sed -i 's|^# REDIS_URL=|REDIS_URL=|' .env
  sed -i '/^# DATABASE_URL=postgresql/d' .env
}

VENV_DIR="${VENV_DIR:-$PROJECT_DIR/venv-dev}"
if [ ! -d "$VENV_DIR" ]; then
  echo -e "${YELLOW}Creating Python venv...${NC}"
  if command -v uv >/dev/null 2>&1; then
    uv venv "$VENV_DIR" --python 3.12
    source "$VENV_DIR/bin/activate"
    uv pip install -r requirements.txt
  else
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install -r requirements.txt
  fi
else
  source "$VENV_DIR/bin/activate"
fi

export DJANGO_SETTINGS_MODULE=config.settings.development
python scripts/patch_django52_libs.py

echo -e "${GREEN}Running migrations...${NC}"
python manage.py migrate --noinput

echo -e "${GREEN}Initializing permissions...${NC}"
python manage.py init_permissions

echo -e "${GREEN}Initializing vehicle service types...${NC}"
python manage.py init_service_types

python manage.py create_all_email_templates >/dev/null 2>&1 || true
python manage.py setup_invoice_email_templates >/dev/null 2>&1 || true

if [ ! -d frontend/node_modules ]; then
  echo -e "${GREEN}Installing frontend dependencies...${NC}"
  (cd frontend && npm install)
fi

cat > frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001/api
EOF

# Create dev admin if missing
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
email = 'admin@example.com'
if not User.objects.filter(email=email).exists():
    User.objects.create_superuser(
        username='admin',
        email=email,
        password='admin123',
        first_name='Admin',
        last_name='User',
    )
    print('Created superuser: admin@example.com / admin123')
else:
    u = User.objects.get(email=email)
    u.set_password('admin123')
    u.is_active = True
    u.is_superuser = True
    u.is_staff = True
    if not u.first_name:
        u.first_name = 'Admin'
    if not u.last_name:
        u.last_name = 'User'
    u.save()
    print('Reset superuser password: admin@example.com / admin123')
"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bootstrap complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Start dev servers:  bash scripts/dev-server.sh"
echo "  Login:              admin@example.com / admin123"
echo "  UI:                 http://127.0.0.1:3001"
echo "  API:                http://127.0.0.1:8001"
echo ""
