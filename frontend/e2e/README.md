# End-to-end tests (Playwright)

Smoke tests for login, work orders, and billing against a running dev stack.

## Prerequisites

1. Start the API and UI (recommended):

   ```bash
   bash scripts/dev-server.sh
   ```

2. Create the E2E user (once per database):

   ```bash
   source venv-dev/bin/activate
   export DJANGO_ENVIRONMENT=development
   python scripts/create_e2e_user.py
   ```

## Run locally

```bash
cd frontend
npm install
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:3001 \
E2E_API_URL=http://127.0.0.1:8001/api \
npm run test:e2e
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `E2E_BASE_URL` | `http://127.0.0.1:3001` | Next.js origin |
| `E2E_API_URL` | `http://127.0.0.1:8001/api` | Django API base |
| `E2E_USERNAME` | `e2e_admin` | Staff user for JWT login |
| `E2E_PASSWORD` | `e2e_test_pass_123` | Password |

## CI

See `.github/workflows/e2e.yml` — runs on pull requests with SQLite test settings and seeds the E2E user automatically.
