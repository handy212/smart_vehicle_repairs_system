import type { VehicleInspection } from "@/lib/api/inspections";
import type { WorkOrder } from "@/lib/api/workorders";
import { isRoutineMaintenanceWorkOrder, isInspectionOnlyWorkOrder, isDiagnosticOnlyWorkOrder } from "@/lib/utils/workorder-workflow-steps";

export type WorkOrderLike = Pick<
  Partial<WorkOrder>,
  | "status"
  | "gate_pass_status"
  | "diagnosis_status"
  | "paused_from_status"
  | "has_technician_assignment"
  | "current_inspection_status"
  | "current_inspection_status_display"
  | "current_inspection_completion_percentage"
  | "current_quote_stage"
  | "current_quote_stage_display"
  | "estimate_summary"
  | "invoice_summary"
>;

export type WorkOrderStagePresentation = {
  workflowStatus: string;
  label: string;
};

export function isDiagnosisPausedWorkOrder(workOrder?: WorkOrderLike | null): boolean {
  if (workOrder?.status !== "paused") return false;
  if (workOrder?.paused_from_status === "diagnosis") return true;
  return workOrder?.diagnosis_status === "paused";
}

function getDiagnosisLifecycleLabel(workOrder?: WorkOrderLike | null): string {
  switch (workOrder?.diagnosis_status) {
    case "in_progress":
      return "Diagnosis | In Progress";
    case "paused":
      return "Diagnosis | Paused";
    case "awaiting_approval":
      return "Diagnosis | Awaiting Approval";
    case "completed":
      return "Diagnosis | Completed";
    case "on_hold":
      return "Diagnosis | On Hold";
    case "not_started":
    default:
      return workOrder?.has_technician_assignment ? "Diagnosis | Assigned" : "Diagnosis | Draft";
  }
}

function parseMoney(value?: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBillingStageLabel(workOrder?: WorkOrderLike | null): string | null {
  const workflowStatus = workOrder?.status;
  if (!workflowStatus || !["completed", "discontinued_pending_bill", "invoiced", "closed"].includes(workflowStatus)) {
    return null;
  }

  if (workflowStatus === "closed") {
    switch (workOrder.gate_pass_status) {
      case "pending":
        return "Gate Pass Pending";
      case "issued":
        return "Gate Pass Issued";
      case "completed":
        return "Vehicle Picked Up";
      case "cancelled":
        return "Gate Pass Cancelled";
      default: {
        const due = parseMoney(workOrder.invoice_summary?.amount_due);
        return due > 0.01 ? "Closed | Payment Outstanding" : "Closed";
      }
    }
  }

  if (workflowStatus === "invoiced") {
    return "Ready to Close";
  }

  const invoice = workOrder.invoice_summary;
  if (invoice?.id) {
    switch (invoice.status) {
      case "draft":
      case "proforma":
        return "Invoice Draft";
      case "paid":
        return "Billing Complete";
      case "void":
      case "refunded":
        return "Waiting for Invoice";
      default:
        return "Awaiting Payment / Handover";
    }
  }

  if (workOrder.estimate_summary?.id) {
    return "Waiting for Invoice";
  }

  return workflowStatus === "discontinued_pending_bill" ? "Pending Invoice" : "Completed";
}

function getInspectionProgressValue(inspection?: Pick<VehicleInspection, "completion_percentage"> | null) {
  return inspection?.completion_percentage ?? 0;
}

function getInspectionSummaryLabel(workOrder?: WorkOrderLike | null): string | null {
  if (!workOrder?.current_inspection_status) {
    return null;
  }

  switch (workOrder.current_inspection_status) {
    case "approved":
      return "Inspection Completed";
    case "completed":
      return "Inspection Completed";
    case "rejected":
      return "Inspection Rejected";
    case "draft":
      return "Inspection Draft";
    case "in_progress":
    default:
      return (workOrder.current_inspection_completion_percentage ?? 0) > 0
        ? "Inspection In Progress"
        : "Inspection Draft";
  }
}

export function getInspectionStageLabel(inspection?: VehicleInspection | null): string {
  if (!inspection) {
    return "Inspection Pending";
  }

  switch (inspection.status) {
    case "approved":
      return "Inspection Approved";
    case "completed":
      return "Inspection Completed";
    case "rejected":
      return "Inspection Rejected";
    case "draft":
      return "Inspection Draft";
    case "in_progress":
    default:
      return getInspectionProgressValue(inspection) > 0
        ? "Inspection In Progress"
        : "Inspection Draft";
  }
}

export function getWorkOrderStagePresentation(
  workOrder: WorkOrderLike | null | undefined,
  inspection?: VehicleInspection | null
): WorkOrderStagePresentation {
  const workflowStatus = workOrder?.status || "draft";
  const isRoutine = isRoutineMaintenanceWorkOrder(workOrder);
  const isInspectionOnly = isInspectionOnlyWorkOrder(workOrder);
  const isDiagnosticOnly = isDiagnosticOnlyWorkOrder(workOrder);

  if (isInspectionOnly) {
    if (["draft", "inspection"].includes(workflowStatus)) {
      return {
        workflowStatus,
        label: workflowStatus === "draft" ? "Inspection scheduled" : "Inspection in progress",
      };
    }
    if (workflowStatus === "completed") {
      return { workflowStatus, label: "Inspection complete" };
    }
  }

  if (isDiagnosticOnly) {
    if (workflowStatus === "awaiting_approval") {
      return { workflowStatus, label: "Diagnostic estimate ready" };
    }
    if (workflowStatus === "completed") {
      return { workflowStatus, label: "Diagnostic complete" };
    }
    if (workflowStatus === "diagnosis") {
      return {
        workflowStatus,
        label: getDiagnosisLifecycleLabel(workOrder),
      };
    }
  }

  if (isRoutine) {
    if (["draft", "inspection", "intake", "assigned", "diagnosis", "awaiting_approval"].includes(workflowStatus)) {
      return {
        workflowStatus,
        label: workflowStatus === "draft" ? "Routine check-in" : "Ready for service",
      };
    }
    if (workflowStatus === "approved") {
      return { workflowStatus, label: "Ready for service" };
    }
    if (workflowStatus === "in_progress") {
      return { workflowStatus, label: "Routine service in progress" };
    }
    if (workflowStatus === "paused") {
      return { workflowStatus, label: "Service paused" };
    }
  }

  if (workflowStatus === "diagnosis") {
    return {
      workflowStatus,
      label: getDiagnosisLifecycleLabel(workOrder),
    };
  }

  if (workflowStatus === "paused" && workOrder?.diagnosis_status === "paused") {
    return {
      workflowStatus,
      label: getDiagnosisLifecycleLabel(workOrder),
    };
  }

  if (workflowStatus === "awaiting_approval") {
    return {
      workflowStatus,
      label: "Diagnosis | Awaiting Approval",
    };
  }

  if (workflowStatus === "approved" && workOrder?.current_quote_stage_display) {
    return {
      workflowStatus,
      label: workOrder.current_quote_stage_display,
    };
  }

  if (workflowStatus === "in_progress") {
    return {
      workflowStatus,
      label: "Repairs In Progress",
    };
  }

  if (workflowStatus === "paused") {
    return {
      workflowStatus,
      label: "Repairs Paused",
    };
  }

  if (workflowStatus === "additional_work_found") {
    return {
      workflowStatus,
      label: "Additional Work Review",
    };
  }

  if (workflowStatus === "quality_check") {
    return {
      workflowStatus,
      label: "Quality Check",
    };
  }

  const billingStageLabel = getBillingStageLabel(workOrder);
  if (billingStageLabel) {
    return {
      workflowStatus,
      label: billingStageLabel,
    };
  }

  if (workflowStatus !== "inspection") {
    return {
      workflowStatus,
      label: "",
    };
  }

  const summaryLabel = getInspectionSummaryLabel(workOrder);
  if (summaryLabel) {
    return {
      workflowStatus,
      label: summaryLabel,
    };
  }

  return {
    workflowStatus,
    label: getInspectionStageLabel(inspection),
  };
}
