# Mobile app strategy

**Decision (June 2026):** Production technician mobile = **Next.js PWA** at `/mobile/*`. The **Expo** scaffold in `/mobile` is **not** maintained for shop features.

## Production path — Next.js PWA

| Area | Routes |
|------|--------|
| Dashboard | `/mobile/dashboard` |
| Work orders | `/mobile/workorders`, `/mobile/workorders/[id]` |
| Inspections | `/mobile/inspections` |
| Schedule | `/mobile/schedule` |
| Roadside | `/mobile/roadside` |
| Time tracking | `/mobile/time-tracking` |
| Notifications | `/mobile/notifications` |

Features: offline queue, pull-to-refresh, `X-Tech-App` header, install prompt (`PwaInstallPrompt`).

Backend mobile API: `apps/workorders/views/time_logs.py`, diagnosis/inspection endpoints, technician permissions.

## Expo directory (`/mobile`)

- Default Expo template only (`app/(tabs)/two.tsx`, etc.).
- **Do not** add shop workflows here until product explicitly prioritizes native app store delivery.
- README in `/mobile/README.md` points technicians to the PWA.

## Options if native is needed later

| Option | When |
|--------|------|
| **Capacitor shell** around PWA | Fastest; single codebase |
| **Expo + shared API client** | Offline/native APIs (camera, push) require native modules |
| **Remove `/mobile` Expo** | If unused after 12 months — reduces confusion |

## Action items

- [x] Document PWA as canonical (`mobile/README.md`, this file)
- [ ] Add CI check that fails if `/mobile/app` gains production routes without ADR update
- [ ] Remove Expo scaffold **or** rename to `mobile-experimental/` when team agrees

## Related

- [`docs/LEGACY-UI-DEPRECATION.md`](LEGACY-UI-DEPRECATION.md) — Django template mobile dashboard
- [`frontend/app/mobile/layout.tsx`](../frontend/app/mobile/layout.tsx) — PWA shell auth gate
