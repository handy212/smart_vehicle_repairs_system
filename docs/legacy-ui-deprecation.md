# Legacy Django UI deprecation

The **canonical user interface** is the Next.js app in [`frontend/`](../frontend/). Django still serves **template-based pages** under non-`api/` URL prefixes for historical compatibility. New features should be built in Next.js only.

## Status legend

| Status | Meaning |
|--------|---------|
| **Deprecated** | Prefer Next.js; Django routes kept for bookmarks and gradual migration |
| **Admin only** | Remains on Django admin or template admin panel |
| **API only** | No Django template UI; use Next.js + DRF |

## URL mapping

| Django template prefix | Namespace | Next.js replacement | Status |
|------------------------|-----------|---------------------|--------|
| `/branches/` | `branches` | `/branches` (dashboard) | Deprecated |
| `/customers/` | `customers` | `/customers` | Deprecated |
| `/vehicles/` | `vehicles` | `/vehicles` | Deprecated |
| `/appointments/` | `appointments` | `/appointments` | Deprecated |
| `/workorders/` | `workorders` | `/workorders` | Deprecated |
| `/gatepass/` | `gatepass` | `/gatepass` | Deprecated |
| `/inventory/` | `inventory` | `/inventory` | Deprecated |
| `/billing/` | `billing` | `/billing` | Deprecated |
| `/inspections/` | `inspections` | `/inspections` | Deprecated |
| `/reporting/` | `reporting` | `/reports` | Deprecated |
| `/notifications/` | `notifications` | `/notifications` | Deprecated |
| `/portal/` (customer templates) | `portal` | `/portal` | Deprecated |
| `/mobile/` | `mobile` | `/mobile` (Next.js PWA) | Deprecated — `workorders/` and `inspections/new/` Django paths redirect to Next |
| `/admin-panel/` | `admin_panel` | `/admin` | Deprecated |
| `/accounts/login/` etc. | — | `/login`, `/register` | Deprecated |
| `/customer/login/` | — | `/portal` auth flows | Deprecated |
| `/admin/` | Django admin | Django admin | Admin only |
| `/api/*` | DRF | Consumed by Next.js | API only |

Route definitions: [`config/urls.py`](../config/urls.py) (template includes) and per-app `frontend_urls.py` files under [`apps/`](../apps/).

## Phasing out template UIs

1. **Do not add** new `frontend_urls.py` routes or templates for staff workflows.
2. **Redirect** (optional): nginx or Django `RedirectView` from legacy paths to the Next.js host for logged-in users.
3. **Remove** an app's `frontend_urls` include only after:
   - Next.js parity is verified
   - No production links reference the Django path (check analytics/logs)
4. Keep **email/PDF** templates that are not interactive UIs.

## Dual Tailwind setups

| Location | Tailwind | Purpose |
|----------|----------|---------|
| Repo root `package.json` | v3 | Legacy Django static CSS (`npm run build:css`) |
| `frontend/` | v4 | Next.js app |

New styling work belongs in `frontend/` only.

## Workflows app

Configurable workflows (`apps/workflows`) are **disabled** in settings (`ENABLE_WORKFLOW_APP = False`). Work order transitions use code in `apps/workorders` mixins until workflows are product-ready.
