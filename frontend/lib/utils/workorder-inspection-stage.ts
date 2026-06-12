import type { VehicleInspection } from "@/lib/api/inspections";
import type { WorkOrder } from "@/lib/api/workorders";

type WorkOrderLike = Pick<
  Partial<WorkOrder>,
  | "status"
  | "current_inspection_status"
  | "current_inspection_status_display"
  | "current_inspection_completion_percentage"
  | "current_quote_stage"
  | "current_quote_stage_display"
>;

export type WorkOrderStagePresentation = {
  workflowStatus: string;
  label: string;
};

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

  if (
    (workflowStatus === "diagnosis" ||
      workflowStatus === "awaiting_approval" ||
      workflowStatus === "approved") &&
    workOrder?.current_quote_stage_display
  ) {
    return {
      workflowStatus,
      label: workOrder.current_quote_stage_display,
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
