/** Minimum 12px (text-xs) typography for operational data tables. */

export const TABLE_HEAD_CLASS =
  "px-4 h-10 text-xs uppercase tracking-wider font-semibold text-muted-foreground select-none";

export const TABLE_CELL_CLASS = "px-4 py-2.5 text-xs text-foreground";

/** Workshop table header — uses theme tokens. */
export const PERFEX_TABLE_HEAD_CLASS =
  "px-4 py-2.5 text-left text-xs font-bold tracking-wide text-[color:var(--table-head-fg)] bg-[var(--table-head-bg)]";

export const PERFEX_TABLE_CELL_CLASS = "px-4 py-3 text-[13px]";

/** Shared elevated panel surface for dashboard / ops boards. */
export const WORKSHOP_PANEL_CLASS =
  "workshop-panel rounded-lg border border-[color:var(--outline-variant)] bg-[var(--panel-bg)] shadow-workshop";

/** Compact table header used in accounting module tables. */
export const ACCOUNTING_TABLE_HEAD_CLASS =
  "h-8 px-4 text-xs uppercase tracking-wider font-semibold text-muted-foreground select-none";
