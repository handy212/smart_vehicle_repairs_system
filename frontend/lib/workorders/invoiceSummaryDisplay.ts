import type { WorkOrder } from "@/lib/api/workorders";

type InvoiceSummary = NonNullable<WorkOrder["invoice_summary"]>;

export type InvoicePaymentDisplay = {
  /** Short label for badges, e.g. Paid, Partially paid */
  paymentLabel: string;
  /** Invoice document status (draft, sent, paid, …) */
  documentStatus: string;
  /** Whether staff can mark the work order as invoiced (issued invoice + not already WO-invoiced) */
  canMarkWorkOrderInvoiced: boolean;
  /** Why mark-as-invoiced is disabled, if applicable */
  markBlockedReason?: string;
  badgeVariant: "default" | "secondary" | "danger" | "outline" | "success" | "warning";
};

function parseMoney(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Human-readable payment + document state for a work order's linked invoice. */
export function getInvoicePaymentDisplay(
  summary: InvoiceSummary | null | undefined,
  workOrderStatus: string,
): InvoicePaymentDisplay | null {
  if (!summary?.id) return null;

  const total = parseMoney(summary.total);
  const paid = parseMoney(summary.amount_paid);
  const due = parseMoney(summary.amount_due);
  const docStatus = summary.status || "draft";
  const documentStatus = docStatus.replace(/_/g, " ");

  let paymentLabel: string;
  let badgeVariant: InvoicePaymentDisplay["badgeVariant"] = "outline";

  if (summary.is_paid || docStatus === "paid" || (total > 0 && due <= 0.01)) {
    paymentLabel = "Paid in full";
    badgeVariant = "success";
  } else if (paid > 0.01 && due > 0.01) {
    paymentLabel = `Partially paid (${paid.toFixed(2)} of ${total.toFixed(2)})`;
    badgeVariant = "secondary";
  } else if (docStatus === "draft") {
    paymentLabel = "Not issued (draft)";
    badgeVariant = "secondary";
  } else if (docStatus === "void") {
    paymentLabel = "Void";
    badgeVariant = "danger";
  } else {
    paymentLabel = due > 0 ? `Balance due ${due.toFixed(2)}` : "Unpaid";
    badgeVariant = "warning";
  }

  const woAlreadyInvoiced = ["invoiced", "closed"].includes(workOrderStatus);
  const invoiceIssued = docStatus !== "draft" && docStatus !== "void" && docStatus !== "proforma";
  const isFullyPaid =
    summary.is_paid ||
    docStatus === "paid" ||
    (total > 0 && due <= 0.01);

  const woAwaitingInvoiced = ["completed", "discontinued_pending_bill"].includes(workOrderStatus);
  let canMarkWorkOrderInvoiced = !woAlreadyInvoiced && invoiceIssued && (!isFullyPaid || woAwaitingInvoiced);
  let markBlockedReason: string | undefined;

  if (woAlreadyInvoiced) {
    canMarkWorkOrderInvoiced = false;
  } else if (docStatus === "draft") {
    canMarkWorkOrderInvoiced = false;
    markBlockedReason = "Issue the invoice (move it out of draft) before marking this work order as invoiced.";
  } else if (docStatus === "void") {
    canMarkWorkOrderInvoiced = false;
    markBlockedReason = "This invoice is void. Create or link another invoice first.";
  }

  return {
    paymentLabel,
    documentStatus,
    canMarkWorkOrderInvoiced,
    markBlockedReason,
    badgeVariant,
  };
}

const ESTIMATE_INVOICE_STATUSES = new Set(["approved", "sent", "viewed"]);

/** Whether billing must go through the linked estimate (not direct WO invoice). */
export function mustInvoiceViaLinkedEstimate(workOrder: {
  estimate_summary?: { id?: number; status?: string } | null;
}): boolean {
  const estimate = workOrder.estimate_summary;
  if (!estimate?.id || !estimate.status) {
    return false;
  }
  return ESTIMATE_INVOICE_STATUSES.has(estimate.status);
}

/** Whether staff can open the create-invoice flow for this work order. */
export function canCreateWorkOrderInvoice(workOrder: {
  status: string;
  invoice_summary?: { id?: number; status?: string } | null;
  estimate_summary?: { id?: number; status?: string } | null;
}): boolean {
  if (!["completed", "discontinued_pending_bill"].includes(workOrder.status)) {
    return false;
  }
  if (mustInvoiceViaLinkedEstimate(workOrder)) {
    return false;
  }
  if (!workOrder.invoice_summary?.id) {
    return true;
  }
  return workOrder.invoice_summary.status === "void";
}
