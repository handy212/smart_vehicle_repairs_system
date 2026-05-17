# Smart Vehicle Repairs Management System

A full-stack vehicle repair and workshop ERP: **Django 5.2** API backend with **Next.js 16** staff dashboard, customer portal, mobile, and technician apps. Covers customers, vehicles, appointments, work orders, inventory, billing, inspections, accounting, HR, reporting, and integrations (Hubtel, Paystack, QuickBooks, Firebase, and more).

## Architecture

| Layer | Technology | Location |
|-------|------------|----------|
| API | Django 5.2 + DRF + JWT | [`config/`](config/), [`apps/`](apps/) |
| Staff / portal UI | Next.js 16, React 19, TypeScript | [`frontend/`](frontend/) |
| Legacy UI (deprecated) | Django templates | [`templates/`](templates/), see [docs/legacy-ui-deprecation.md](docs/legacy-ui-deprecation.md) |
| Task queue | Celery + Redis | [`config/celery.py`](config/celery.py) |
| Realtime | Django Channels | ASGI in [`config/`](config/) |

**Design system:** [DESIGN.md](DESIGN.md) — “Precision Curator” UI spec for the Next.js app.

## Prerequisites

- **Python 3.12+** (Docker and production use 3.12)
- **Node.js 20+** (frontend)
- **PostgreSQL** and **Redis** (recommended for local dev; SQLite fallback if `DATABASE_URL` is unset)
- `pip`, `npm`

## Quick start (recommended)

The dev script starts the API, Next.js, and Celery with consistent ports:

```bash
bash scripts/dev-server.sh
```

| Service | URL |
|---------|-----|
| Django API | http://127.0.0.1:8001 |
| Next.js app | http://127.0.0.1:3001 |
| API docs (Swagger) | http://127.0.0.1:8001/api/docs/ |
| Django admin | http://127.0.0.1:8001/admin/ |

Stop all dev processes:

```bash
bash scripts/dev-stop.sh
```

The script creates `venv-dev`, applies migrations, runs `init_permissions`, and writes `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8001/api`.

Optional infrastructure only (Postgres on **5433**, Redis on **6379**):

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Manual setup

### Backend

```bash
python3 -m venv venv-dev
source venv-dev/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit SECRET_KEY, DATABASE_URL, etc.
export DJANGO_ENVIRONMENT=development
python scripts/patch_django52_libs.py   # if prompted by dev-server
python manage.py migrate
python manage.py init_permissions
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8001
```

### Frontend

```bash
cd frontend
npm install
# .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8001/api
npm run dev
```

See [frontend/README.md](frontend/README.md) for structure, auth flow, and env vars.

### Celery (optional)

```bash
celery -A config worker -l info
celery -A config beat -l info
```

## Testing

### Backend (pytest)

```bash
source venv-dev/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.testing
pytest
```

Configuration: [`pytest.ini`](pytest.ini) — **80% coverage** fail-under on `apps/`, in-memory SQLite, eager Celery.

### Frontend (Vitest)

```bash
cd frontend
npm run test
npm run test:coverage
```

### End-to-end (Playwright)

Requires the dev stack running (API on 8001, UI on 3001):

```bash
cd frontend
npm run test:e2e
```

See [frontend/e2e/README.md](frontend/e2e/README.md).

## Production deployment

- **Docker:** [deploy/DOCKER_PRODUCTION_RUNBOOK.md](deploy/DOCKER_PRODUCTION_RUNBOOK.md) — full stack (Postgres 15, Redis 7, nginx, Celery).
- **Rsync / systemd:** [deploy/README.md](deploy/README.md).

Production API is typically on port **8000** behind nginx; frontend on **3000**. Development intentionally uses **8001** / **3001** to avoid conflicts.

## Project structure

```
smart_vehicle_repairs_system/
├── apps/                    # Django domain apps (27 modules)
│   ├── accounts/            # Users, JWT, RBAC, 2FA
│   ├── workorders/          # Repair jobs, transitions
│   ├── billing/             # Estimates, invoices, payments
│   ├── inventory/           # Parts, POs, transfers
│   └── …                    # customers, vehicles, hr, accounting, …
├── config/                  # Settings, URLs, Celery
├── frontend/                # Next.js App Router UI
├── templates/               # Legacy Django templates
├── deploy/                  # Production scripts and runbooks
├── scripts/                 # dev-server.sh, DB helpers
├── tests/                   # Cross-app pytest tests
├── requirements.txt
├── pytest.ini
├── docker-compose.yml
├── DESIGN.md
└── docs/
```

## API documentation

With the backend running:

- **Swagger UI:** `/api/docs/`
- **ReDoc:** `/api/redoc/`
- **OpenAPI schema:** `/api/schema/`

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Key variables:

- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — cache and Celery broker
- Payment/SMS/OAuth keys (Hubtel, Paystack, Google, Firebase) as needed

Environment-specific settings live under [`config/settings/`](config/settings/) (`development`, `production`, `staging`, `testing`).

## User roles

Dynamic RBAC with roles such as Admin, Manager, Service Coordinator, Receptionist, Parts Manager, Accountant, Technician, and Customer. Permissions are seeded via `python manage.py init_permissions`.

## Documentation index

| Document | Purpose |
|----------|---------|
| [frontend/README.md](frontend/README.md) | Next.js app |
| [deploy/DOCKER_PRODUCTION_RUNBOOK.md](deploy/DOCKER_PRODUCTION_RUNBOOK.md) | Docker production |
| [DESIGN.md](DESIGN.md) | UI design system |
| [docs/auth-hardening.md](docs/auth-hardening.md) | Auth roadmap (JWT, httpOnly, edge validation) |
| [docs/legacy-ui-deprecation.md](docs/legacy-ui-deprecation.md) | Legacy Django UI → Next.js mapping |

## CI

- **Backend:** `.github/workflows/backend-ci.yml` — pytest + coverage gate
- **Frontend:** `.github/workflows/frontend-ci.yml` — lint, typecheck, tests, build
- **E2E:** `.github/workflows/e2e.yml` — Playwright smoke tests

## License

MIT License.
