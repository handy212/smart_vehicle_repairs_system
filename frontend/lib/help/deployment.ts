import { Server } from "lucide-react";
import type { HelpGuide } from "./types";

export const deploymentGuides: HelpGuide[] = [
    {
        id: "deploy-guide",
        title: "Installation & Deployment Guide",
        description:
            "Docker setup, environment variables, database, SSL, backups, updates, and production troubleshooting.",
        icon: Server,
        section: "deployment",
        keywords: ["docker", "deployment", "production", "ssl", "backup", "env"],
        topics: [
            {
                title: "System requirements",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Production stack: Django API, Next.js frontend, PostgreSQL, Redis, Celery worker, Celery beat, and Nginx reverse proxy. Minimum server: 4 GB RAM, 2 vCPU, 40 GB SSD for small workshops.",
                    },
                ],
            },
            {
                title: "Docker setup",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Install Docker and Docker Compose on the server.",
                            "Clone the repository to `/opt/smart_vehicle_repairs_system`.",
                            "Copy environment file: `cp .env.production.example .env`.",
                            "Edit `.env` with production values (see Environment Variables below).",
                            "Start stack: `docker compose -f docker-compose.prod.yml up -d`.",
                            "Run migrations: `docker compose exec backend python manage.py migrate`.",
                            "Seed permissions: `docker compose exec backend python manage.py init_permissions`.",
                            "Create superuser: `docker compose exec backend python manage.py createsuperuser`.",
                        ],
                    },
                    {
                        type: "note",
                        text: "See `deploy/DOCKER_PRODUCTION_RUNBOOK.md` in the repository for the full production runbook with Nginx Proxy Manager SSL setup.",
                    },
                ],
            },
            {
                title: "Environment variables",
                blocks: [
                    {
                        type: "checklist",
                        title: "Required production values",
                        items: [
                            "DJANGO_ENVIRONMENT=production",
                            "DEBUG=False",
                            "SECRET_KEY=<long random secret>",
                            "ALLOWED_HOSTS=your-frontend-domain,your-api-domain",
                            "DATABASE_URL=postgresql://user:pass@db:5432/dbname",
                            "REDIS_URL=redis://:password@redis:6379/0",
                            "API_URL=https://your-api-domain/api",
                            "CORS_ALLOWED_ORIGINS=https://your-frontend-domain",
                            "CSRF_TRUSTED_ORIGINS=https://your-frontend-domain,https://your-api-domain",
                            "SESSION_COOKIE_SECURE=True and CSRF_COOKIE_SECURE=True",
                        ],
                    },
                    {
                        type: "tips",
                        title: "Integration variables",
                        items: [
                            "PAYSTACK_PUBLIC_KEY / PAYSTACK_SECRET_KEY for online payments",
                            "HUBTEL_CLIENT_ID / HUBTEL_CLIENT_SECRET for SMS",
                            "EMAIL_HOST / EMAIL_HOST_USER / EMAIL_HOST_PASSWORD for notifications",
                            "FIREBASE_CREDENTIALS_PATH for push notifications",
                        ],
                    },
                ],
            },
            {
                title: "Database setup",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "PostgreSQL runs in the Docker `db` service by default.",
                            "Set DB_NAME, DB_USER, DB_PASSWORD in `.env`.",
                            "Run migrations after every deployment.",
                            "For external managed PostgreSQL, point DATABASE_URL to the hosted instance.",
                            "Schedule nightly pg_dump backups via `deploy/docker-backup.sh`.",
                        ],
                    },
                ],
            },
            {
                title: "SSL and HTTPS",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Recommended: terminate SSL at Nginx Proxy Manager or cloud load balancer.",
                            "Set SECURE_SSL_REDIRECT=False when HTTPS is handled upstream.",
                            "Ensure X-Forwarded-Proto headers reach Django.",
                            "Use separate hostnames for frontend (aap.example.com) and API (api.example.com).",
                            "Renew certificates before expiry — monitor NPM or certbot alerts.",
                        ],
                    },
                ],
            },
            {
                title: "Backups and updates",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create full backups from **Admin → System Backups** or run `deploy/docker-backup.sh`.",
                            "Store backups off-server (S3, external drive, secondary server).",
                            "To update: pull latest code, rebuild images, run migrations, restart services.",
                            "Always backup before updates.",
                            "Test updates on staging using `docker-compose.staging.yml` first.",
                        ],
                    },
                ],
                actionLink: "/admin/backups",
                actionLabel: "System Backups",
            },
            {
                title: "Production troubleshooting",
                blocks: [
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "502 Bad Gateway",
                                solution:
                                    "Check backend container is running: `docker compose ps`. Review backend logs: `docker compose logs backend`.",
                            },
                            {
                                problem: "Static files or media not loading",
                                solution:
                                    "Run collectstatic. Verify Nginx aliases for /static/ and /media/. Check volume mounts.",
                            },
                            {
                                problem: "Celery tasks not running",
                                solution:
                                    "Ensure worker and beat containers are up. Verify REDIS_URL. Check worker logs.",
                            },
                            {
                                problem: "Paystack webhook failures",
                                solution:
                                    "Webhook URL must be public HTTPS API endpoint. Verify PAYSTACK_SECRET_KEY matches dashboard.",
                            },
                            {
                                problem: "Database connection refused",
                                solution:
                                    "Wait for db healthcheck on first boot. Verify DATABASE_URL credentials and network.",
                            },
                        ],
                    },
                ],
            },
        ],
    },
];
