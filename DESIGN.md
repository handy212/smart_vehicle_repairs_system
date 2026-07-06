# Design System Strategy: The High-Density Editorial Dashboard

## 1. Overview & Creative North Star
**Creative North Star: "The Precision Curator"**
This design system moves away from the "boxy" nature of traditional enterprise software. Instead of rigid containers defined by harsh lines, we utilize **Tonal Architecture**. The goal is to provide high information density that feels breathable, intentional, and premium. 

By prioritizing "Editorial Hierarchy"—where the most critical data points are granted exaggerated scale and secondary metadata is treated with sophisticated, muted tones—we create a system that is both functional for power users and aesthetically superior. We break the template look through **layered depth** and **asymmetric balance**, ensuring that even a compact dashboard feels like a custom-designed piece of intelligence.

---

## 2. Colors & Surface Logic

The palette uses a sophisticated foundation of muted "utility" colors—blues, oranges, and greens—grounded in a clean, multi-layered neutral scale.

### The "No-Line" Rule
**Explicit Instruction:** Prohibition of 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a widget container (`surface-container-lowest`) sits on a workspace background (`surface`) without a stroke.

### Surface Hierarchy & Nesting
Depth is achieved by stacking levels of the surface-container scale. This creates a "Paper on Glass" effect.
*   **Base Layer:** `surface` (#f7f9fb) – The canvas.
*   **Low Contrast Sectioning:** `surface-container-low` (#f2f4f6) – Used for grouping large functional areas.
*   **Elevated Widgets:** `surface-container-lowest` (#ffffff) – Primary card backgrounds to make data pop.
*   **Active Overlays:** `surface-bright` (#f7f9fb) – Used for interactive hover states or active panel highlights.

### The "Glass & Gradient" Rule
To elevate CTAs beyond standard flat UI:
*   **Signature Gradients:** Use a subtle linear transition from `primary` (#0230a1) to `primary_container` (#2a4ab8) on main action buttons.
*   **Glassmorphism:** For floating tooltips or "Live Feed" badges, use `surface-container-lowest` with an 85% opacity and a `24px` backdrop-blur.

---

## 3. Typography: Editorial Authority

We use **Inter** as a variable font to maximize legibility at small scales while maintaining a premium feel.

*   **Display & Headlines:** Use `headline-sm` (1.5rem) for main dashboard headers. Keep tracking tight (-0.02em) to maintain a modern, "compact" editorial look.
*   **Data Points (The Hero):** Use `title-lg` (1.375rem) with a `medium` (500) weight for primary metrics (e.g., Revenue totals).
*   **The Metadata Layer:** `label-sm` (0.6875rem) and `body-sm` (0.75rem) are the workhorses. Use `on-surface-variant` (#44474c) for secondary labels to create clear visual separation from primary data.
*   **Instructional Text:** All helper text must be in `body-sm`. Avoid using `body-lg` in compact dashboard views to preserve vertical rhythm.

---

## 4. Elevation & Depth

Hierarchy is conveyed through **Tonal Layering** and physics-based light simulation.

*   **The Layering Principle:** Depth is "stacked." Place a `surface-container-lowest` card on a `surface-container-low` section. The change in hex code provides enough contrast to define the boundary without visual clutter.
*   **Ambient Shadows:** For primary widgets, use an extra-diffused shadow: `box-shadow: 0 4px 20px rgba(25, 28, 30, 0.06)`. Note the use of `on-surface` (#191c1e) at a very low opacity (6%) to mimic natural light rather than a synthetic grey.
*   **The "Ghost Border" Fallback:** If a boundary is absolutely required for accessibility, use `outline-variant` (#c4c6cd) at **15% opacity**. Never use 100% opaque outlines.

---

## 5. Components

### Buttons & Actions
*   **Primary Action:** Gradient-filled (`primary` to `primary-container`), `roundness-md` (0.375rem). Bold but compact.
*   **Secondary Action:** `surface-container-high` background with `on-surface` text. No border.
*   **Ghost Action:** No background; `primary` text. Use for low-emphasis "View All" links.

### Data Chips & Status
*   **Status Badges:** Use `secondary-fixed-dim` for "Warning" and `tertiary-fixed-dim` for "Success." Keep padding tight: `spacing-1` (0.2rem) vertical, `spacing-2.5` (0.5rem) horizontal.
*   **Live Indicators:** Use a pulse animation on a small 6px circle using `tertiary` (#004720) to signify real-time data without using distracting text.

### Compact Inputs
*   **Search/Text Fields:** Use `surface-container-low` with a `ghost border` on focus. The label should be `label-sm` placed above the field, never inside as a placeholder, to maintain accessibility in high-density views.

### The "No-Line" List
*   **Lists:** Forbid divider lines. Use `spacing-2` (0.4rem) of vertical whitespace and a subtle background shift (`surface-container-low`) on hover to define list items.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `spacing-4` (0.9rem) as your standard gutter between widgets to ensure the high-density data has room to breathe.
*   **Do** use `on-surface-variant` for "unit" labels (e.g., "kg", "USD") to keep the focus on the numerical value.
*   **Do** align all icons to a strict 20px or 24px bounding box to maintain the "neat" requirement.

### Don't
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#191c1e) to keep the contrast sophisticated and readable.
*   **Don't** use `roundness-full` for large containers; reserve it only for chips and tags. Use `roundness-lg` (0.5rem) for cards to maintain a "structured" dashboard feel.
*   **Don't** use standard "Drop Shadows" from software defaults. Always tint your shadows with the `on-surface` color at <8% opacity.