/**
 * Dashboard workspace width.
 * Pages fill the shell content area; the layout already provides horizontal padding.
 * Do not re-introduce narrow max-w-* columns on module pages.
 */
export const WORKSPACE_CLASS = "w-full";

/** Create / edit form pages — same full workspace as lists and details. */
export const FORM_PAGE_CLASS = "w-full";

/** @deprecated Use FORM_PAGE_CLASS — kept so older imports stay full-width. */
export const INTAKE_FORM_CLASS = FORM_PAGE_CLASS;

/** List / table pages. */
export const LIST_PAGE_CLASS = "w-full";

export {
  TABLE_HEAD_CLASS,
  TABLE_CELL_CLASS,
  PERFEX_TABLE_HEAD_CLASS,
  PERFEX_TABLE_CELL_CLASS,
  ACCOUNTING_TABLE_HEAD_CLASS,
  WORKSHOP_PANEL_CLASS,
} from "./table-typography";
