/** Slugs supported by GET /accounting/reports/<slug>/print|pdf/ */
export const ACCOUNTING_REPORT_PRINT_SLUGS = [
  "balance-sheet",
  "profit-loss",
  "trial-balance",
  "general-ledger",
  "aging",
  "cash-flow",
  "tax",
  "job-profitability",
  "margin-analysis",
  "expense-breakdown",
  "management",
  "cost-control",
  "opex-variance",
  "supplier-ap-aging",
] as const;

export type AccountingReportPrintSlug = (typeof ACCOUNTING_REPORT_PRINT_SLUGS)[number];

export function isAccountingReportPrintSlug(slug: string): slug is AccountingReportPrintSlug {
  return (ACCOUNTING_REPORT_PRINT_SLUGS as readonly string[]).includes(slug);
}

export function buildAccountingReportApiPath(
  slug: AccountingReportPrintSlug,
  format: "print" | "pdf",
  params: Record<string, string | undefined>
): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      qs.set(key, value);
    }
  });
  const query = qs.toString();
  return `/accounting/reports/${slug}/${format}/${query ? `?${query}` : ""}`;
}
