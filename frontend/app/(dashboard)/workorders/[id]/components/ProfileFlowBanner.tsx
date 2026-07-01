"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, DollarSign, Search, Stethoscope, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkOrder } from "@/lib/api/workorders";
import { useWorkOrderProfile } from "@/lib/hooks/useWorkOrderProfile";
import {
  canCreateWorkOrderInvoice,
  mustInvoiceViaLinkedEstimate,
} from "@/lib/workorders/invoiceSummaryDisplay";

interface ProfileFlowBannerProps {
  workOrder: WorkOrder;
  workOrderId: number;
}

export function ProfileFlowBanner({ workOrder, workOrderId }: ProfileFlowBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const { isInspectionOnly, isDiagnosticOnly } = useWorkOrderProfile(workOrder);

  if (dismissed || (!isInspectionOnly && !isDiagnosticOnly)) {
    return null;
  }

  const billingStatuses = new Set(["completed", "discontinued_pending_bill", "invoiced"]);
  const needsBilling = billingStatuses.has(workOrder.status) && !workOrder.invoice_summary?.id;
  const invoiceViaEstimate = mustInvoiceViaLinkedEstimate(workOrder);
  const canCreateInvoice = canCreateWorkOrderInvoice(workOrder);
  const estimateId = workOrder.estimate_summary?.id;

  if (isInspectionOnly) {
    const needsInspection = ["draft", "inspection"].includes(workOrder.status);
    if (!needsInspection && !needsBilling) return null;

    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3">
        <div className="flex gap-3">
          <Search className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <div>
            <p className="text-sm font-medium text-foreground">Inspection-only job</p>
            {needsInspection ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Complete the vehicle inspection, then mark this job complete. Intake, diagnosis, and
                repairs are not part of this workflow.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Work is complete. Create and issue an invoice for the inspection fee, confirm billing
                complete, then close the work order.
              </p>
            )}
            {needsBilling && canCreateInvoice && (
              <Button asChild size="sm" className="mt-2 h-8">
                <Link href={`/billing/invoices/new?work_order=${workOrderId}`}>
                  <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                  Create inspection invoice
                </Link>
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (isDiagnosticOnly) {
    const inDiagnosticFlow = [
      "draft",
      "inspection",
      "intake",
      "assigned",
      "diagnosis",
      "awaiting_approval",
      "approved",
    ].includes(workOrder.status);
    if (!inDiagnosticFlow && !needsBilling) return null;

    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <div className="flex gap-3">
          <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Diagnostic-only job</p>
            {inDiagnosticFlow ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Perform diagnosis and share the estimate with the customer. When finished, mark the job
                  complete — no repair work is expected on this work order.
                </p>
                {workOrder.status === "awaiting_approval" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8"
                    onClick={() => router.push(`/workorders/${workOrderId}?tab=overview`)}
                  >
                    <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                    Review on overview
                  </Button>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {invoiceViaEstimate && estimateId
                  ? "Convert the approved estimate to an invoice, confirm billing complete, then close the work order."
                  : "Create and issue an invoice for the diagnostic service, confirm billing complete, then close the work order."}
              </p>
            )}
            {needsBilling && invoiceViaEstimate && estimateId && (
              <Button asChild size="sm" variant="outline" className="mt-2 h-8">
                <Link href={`/billing/estimates/${estimateId}`}>
                  <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                  Open estimate to invoice
                </Link>
              </Button>
            )}
            {needsBilling && canCreateInvoice && !invoiceViaEstimate && (
              <Button asChild size="sm" className="mt-2 h-8">
                <Link href={`/billing/invoices/new?work_order=${workOrderId}`}>
                  <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                  Create diagnostic invoice
                </Link>
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return null;
}
