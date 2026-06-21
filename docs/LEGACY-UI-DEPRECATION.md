# Legacy Django template UI — deprecation plan

**Status:** Deprecated in favor of the Next.js app (`frontend/`).  
**Last updated:** June 2026

## Current state

Staff and customer flows are implemented in the **Next.js** dashboard, portal, and `/mobile/*` PWA. Django still serves legacy template routes under:

| Prefix | Module | Notes |
|--------|--------|-------|
| `/accounts/*` | `django.contrib.auth` templates | Superseded by `/login`, `/register` in Next.js |
| `/customer/*` | `apps.customers.auth_views` | Superseded by portal + Next.js auth |
| `/branches/` | `apps.branches.frontend_urls` | Branch admin in Next.js |
| `/customers/` | `apps.customers.frontend_urls` | Customer CRM in Next.js |
| `/vehicles/` | `apps.vehicles.frontend_urls` | Vehicle pages in Next.js |
| `/appointments/` | `apps.appointments.frontend_urls` | Scheduling in Next.js |
| `/workorders/` | `apps.workorders.frontend_urls` | Work orders in Next.js |
| `/gatepass/` | `apps.gatepass.frontend_urls` | Gate pass in Next.js |
| `/inventory/` | `apps.inventory.frontend_urls` | Inventory in Next.js |
| `/billing/` | `apps.billing.frontend_urls` | Billing in Next.js |
| `/inspections/` | `apps.inspections.frontend_urls` | Inspections in Next.js |
| `/reporting/` | `apps.reporting.frontend_urls` | Reports in Next.js `/reports` |
| `/notifications/` | `apps.notifications_app.frontend_urls` | Notifications in Next.js |

Each `frontend_urls.py` module exposes Django class-based views for HTML/CSV/PDF exports that predate the SPA.

## What remains on Django templates (intentional for now)

- **Print/PDF/export helpers** invoked from DRF actions (e.g. work order PDF, estimate print) — keep until all print flows use Next.js or signed URLs.
- **Admin** (`/admin/`) — Django admin stays.
- **API** (`/api/*`) — primary integration surface; not deprecated.

## Removal criteria (per module)

Before deleting a `frontend_urls` include from `config/urls.py`:

1. Next.js route parity confirmed (list, detail, create, edit, print if applicable).
2. No production links in emails/SMS pointing to the Django path.
3. Integration/smoke test covers the Next.js path.
4. Redirect (301) from old path to new path for one release cycle (optional).

## Recommended order

1. `reporting/frontend_urls` — lowest traffic; Next.js reports complete.
2. `notifications/frontend_urls` — in-app notifications in Next.js.
3. `accounts/login` + `customer/*` auth templates — after HttpOnly cookie auth (Phase B) is stable.
4. Operational modules: workorders → billing → inventory → appointments.
5. Remove `templates/mobile/dashboard.html` when PWA dashboard is default for all technicians.

## Do not remove yet

- `apps/*/frontend_views.py` functions **called from DRF** (e.g. `WorkOrderViewSet.export`) until those actions proxy to Next.js or static export services.

## Tracking

When a module is removed, delete its `frontend_urls.py` entry in `config/urls.py` and add a line to this doc under **Removed**.

### Removed

_(none yet)_
