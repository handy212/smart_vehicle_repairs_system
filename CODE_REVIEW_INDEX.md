# Code Review — Navigation Index

> **Archive notice:** This index was written in **October 2025**. Metrics below were **verified June 2026**. For current integration status see [`docs/QBO-INTEGRATION-GUIDE.md`](docs/QBO-INTEGRATION-GUIDE.md), mobile strategy [`docs/MOBILE-APP-STRATEGY.md`](docs/MOBILE-APP-STRATEGY.md), and legacy UI plan [`docs/LEGACY-UI-DEPRECATION.md`](docs/LEGACY-UI-DEPRECATION.md).

**Last verified:** June 20, 2026  
**Project:** Smart Vehicle Repairs System  
**Overall grade:** B+ (architecture) / B− (test depth in reporting & chat)  
**Status:** ~90% feature complete · ~60% backend test coverage · CI gate 48% (ratcheting to 55%+)

---

## Start here

Historical deep-dives (October 2025) — still useful for patterns, not for current metrics:

1. **[REVIEW_SUMMARY.md](docs/REVIEW_SUMMARY.md)** — original findings (partially outdated)
2. **[CODE_REVIEW_REPORT.md](docs/CODE_REVIEW_REPORT.md)** — full technical review
3. **[ACTION_PLAN.md](docs/ACTION_PLAN.md)** — original 3-week roadmap (mostly superseded)

**Current operational docs:**

- [QBO Integration Guide](docs/QBO-INTEGRATION-GUIDE.md)
- [Auth hardening](docs/auth-hardening.md) — Phase B HttpOnly cookies
- [Legacy UI deprecation](docs/LEGACY-UI-DEPRECATION.md)
- [Mobile app strategy](docs/MOBILE-APP-STRATEGY.md)

---

## Quick stats (June 2026)

| Metric | Value | Status |
|--------|-------|--------|
| Django apps | 25+ | ✅ |
| API surface | OpenAPI `/api/docs/` | ✅ |
| Backend test coverage (`apps/`) | ~60% | 🟡 |
| CI `cov-fail-under` | 48% → 55% (ratchet) | 🟡 |
| QuickBooks Online | Implemented + tested | ✅ |
| Next.js primary UI | Dashboard, portal, `/mobile` PWA | ✅ |
| Reporting app coverage | ~41% | 🔴 |
| Chat app coverage | Was ~0% API tests; improving | 🟡 |
| Legacy Django templates | Deprecated, not removed | 🟡 |
| Expo `/mobile` scaffold | Experimental only | 🟡 |

---

## Resolved since October 2025

| October 2025 issue | June 2026 status |
|--------------------|------------------|
| No automated tests | **851+ pytest tests**, CI workflow |
| No API documentation | **drf-spectacular** schema + Swagger UI |
| No tests at all | Coverage ~60%; gate staged incrementally |
| QBO not started | **Phase 1–3 document bridge done** |

---

## Active priorities (June 2026)

### P1 — Quality

1. **Reporting & chat behavioral tests** — analytics correctness, conversation permissions
2. **`workorders/views.py` split** — package under `apps/workorders/views/` (done in PR)
3. **Typed exceptions + logging** — notification templates, Hubtel SMS, bank upload parsing
4. **Coverage ratchet** — 48% → 55% → 65% (not a single jump to 80%)

### P2 — Strategic

1. **Legacy template routes** — remove per [`LEGACY-UI-DEPRECATION.md`](docs/LEGACY-UI-DEPRECATION.md)
2. **Mobile** — PWA canonical; Expo stub documented, not expanded
3. **`@extend_schema`** — expand on chat, reporting ops, external portal APIs

---

## Success criteria (updated)

- [x] CI pytest with coverage artifact
- [x] OpenAPI schema generation
- [x] QBO document sync (customers, invoices, estimates, AP bills/credits)
- [x] Next.js staff + portal + mobile PWA
- [x] Auth Phase B (HttpOnly cookies via Next.js BFF)
- [ ] Coverage ≥ 65% (staged)
- [ ] Reporting + chat ≥ 60% app coverage
- [ ] Legacy `frontend_urls` modules removed (phased)
- [ ] Zero bare `except:` in production notification/payment paths

---

## Common questions

**Can we deploy now?**  
Closer than October 2025. Remaining risk: under-tested reporting aggregations and chat WebSocket paths; staged coverage gate reflects pragmatic rollout.

**Biggest technical debt?**  
Legacy Django HTML routes (parallel to Next.js), large `workorders` view modules (being split), and incremental OpenAPI annotations.

**Where is the mobile app?**  
Production: **Next.js PWA** at `/mobile/*`. Expo folder is a placeholder — see [MOBILE-APP-STRATEGY.md](docs/MOBILE-APP-STRATEGY.md).

---

_For the original October 2025 timeline, critical issues list, and week-by-week checklist, see git history of this file or `docs/ACTION_PLAN.md`._
