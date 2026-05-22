import type { WorkOrder } from "@/lib/api/workorders";

export type WorkOrderBillingFields = Pick<
  WorkOrder,
  "invoice_summary" | "total_cost" | "estimated_total" | "estimate_summary"
>;

export function parseWorkOrderMoney(v: string | number | undefined | null): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Amount the customer is billed (invoice total). */
export function resolveWorkOrderInvoiceAmount(wo: WorkOrderBillingFields): number | null {
  if (wo.invoice_summary?.total != null) {
    return parseWorkOrderMoney(wo.invoice_summary.total);
  }
  if (wo.total_cost != null && wo.total_cost !== "") {
    return parseWorkOrderMoney(wo.total_cost);
  }
  return null;
}

export type ListBillingDisplay = {
  amount: number;
  label: "Invoice" | "Estimate";
  statusLine?: string;
};

function invoiceStatusLine(
  summary: NonNullable<WorkOrder["invoice_summary"]>,
  formatDue?: (amount: number) => string,
): string | undefined {
  const due = parseWorkOrderMoney(summary.amount_due);
  if (summary.is_paid || summary.status === "paid" || due <= 0.01) {
    return "Paid";
  }
  if (summary.status === "partial" && due > 0) {
    return formatDue ? `Due ${formatDue(due)}` : `Due ${due.toFixed(2)}`;
  }
  if (summary.status) {
    return summary.status.replace(/_/g, " ");
  }
  return undefined;
}

/**
 * Primary billing line for work order lists.
 * Staff: invoice only (null until invoiced).
 * Customer: invoice when issued, otherwise approved estimate total.
 */
export function getWorkOrderListBillingDisplay(
  wo: WorkOrderBillingFields,
  options?: {
    audience?: "staff" | "customer";
    formatDue?: (amount: number) => string;
  },
): ListBillingDisplay | null {
  const audience = options?.audience ?? "staff";
  const invoiceAmount = resolveWorkOrderInvoiceAmount(wo);

  if (invoiceAmount != null && wo.invoice_summary) {
    return {
      amount: invoiceAmount,
      label: "Invoice",
      statusLine: invoiceStatusLine(wo.invoice_summary, options?.formatDue),
    };
  }

  if (audience === "staff") {
    return null;
  }

  const estimateTotal =
    wo.estimate_summary?.total != null
      ? parseWorkOrderMoney(wo.estimate_summary.total)
      : parseWorkOrderMoney(wo.estimated_total);

  if (estimateTotal > 0) {
    return { amount: estimateTotal, label: "Estimate" };
  }

  return null;
}

/** Sum billed invoice totals for vehicle/history stats (ignores shop estimates). */
export function sumWorkOrderInvoiceAmounts(workOrders: WorkOrderBillingFields[]): number {
  return workOrders.reduce((sum, wo) => sum + (resolveWorkOrderInvoiceAmount(wo) ?? 0), 0);
}
