# Design System: Workshop Operations UI

## Creative North Star
**"Clean + chunky workshop"** — an operations desk for garage staff, not a premium CRM magazine layout.

Pages fill the shell content area. Surfaces are tonal panels with light borders and soft elevation. Density stays readable at 14px body without sparse CRM gutters.

---

## Theme tokens (`html.perfex` / `.perfex`)

| Role | Light |
|------|--------|
| Canvas | `#f3f2ef` |
| Ink | `#1c2430` |
| Panel | `#ffffff` (`--panel-bg`) |
| Primary | `#1e4d6b` (branding can override) |
| Border / outline | `#e2ddd4` / `--outline-variant` |
| Radius | `0.5rem` (8px) |
| Elevation | `--elevated-shadow` / `shadow-workshop` |

Font: **Manrope** via `--font-sans`. Body size under Perfex: **14px**.

Semantic colors: `primary`, `success`, `warning`, `destructive`, `info` — use these instead of raw Tailwind blues/greens/ambers.

---

## Layout

- Shell padding lives in `DashboardLayout` / portal shell. Do **not** re-add page-level `max-w-5xl mx-auto` or stacked `p-4 md:p-6` gutters on module pages.
- Shared constants in `frontend/lib/constants/layout.ts`: `WORKSPACE_CLASS`, `FORM_PAGE_CLASS`, `LIST_PAGE_CLASS` → full width.
- Panel surfaces: `WORKSHOP_PANEL_CLASS` / `.workshop-panel` / `.ui-card` (Card primitive).
- Narrow max-width is allowed only for intentionally short flows (e.g. change-password) or phone shells (`max-w-md`).

---

## Typography

- Page titles: `text-xl font-bold tracking-tight`
- Section titles in forms: `text-base font-medium`
- Avoid `font-black`, huge marketing `text-3xl` page titles, and Inter/Roboto defaults

---

## Components

### Card / panel
`rounded-lg`, `border` with `--outline-variant`, `shadow-workshop`, no hover lift.

### Dialog / sheet / popover / dropdown
Same panel tokens and `shadow-workshop`. Overlay: `bg-foreground/40` (no heavy glass blur).

### Buttons
Primary uses `shadow-workshop`. Compact heights (`h-9` default).

### Badges
`rounded-md` (not full pills by default). Semantic variants only.

### Forms
- Full workspace width; field grids expand on `xl` where useful.
- Action rails: `lg:sticky lg:top-20` sidebars or sticky bottom footers so save stays reachable.

### Tables
Use shared table typography from `table-typography.ts`. Prefer full-width tables inside workshop panels.

---

## Do / Don’t

**Do**
- Prefer theme tokens and semantic colors
- Keep one clear job per section
- Use sticky actions on long create/edit forms

**Don’t**
- Reintroduce CRM width caps on dashboard modules
- Hardcode `bg-blue-500` / rose / purple rails
- Add hover scale / multi-layer glow chrome
- Place cards purely for decoration with no interaction or grouping need
