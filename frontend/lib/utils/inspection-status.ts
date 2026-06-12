import type { VehicleInspection } from "@/lib/api/inspections";

type InspectionLike = Pick<
  Partial<VehicleInspection>,
  "status" | "status_display" | "completion_percentage" | "results"
>;

export function getInspectionStageLabel(inspection?: InspectionLike | null): string {
  if (!inspection) {
    return "Inspection";
  }

  if (inspection.status === "approved") {
    return "Inspection Completed";
  }

  if (inspection.status === "completed") {
    return "Inspection Completed";
  }

  if (inspection.status === "rejected") {
    return "Inspection Rejected";
  }

  const progress = inspection.completion_percentage ?? 0;
  return progress > 0 ? "Inspection In Progress" : "Inspection Draft";
}

export function getInspectionStageTone(
  inspection?: InspectionLike | null
): "draft" | "in_progress" | "completed" | "approved" | "rejected" {
  if (!inspection) {
    return "draft";
  }

  if (inspection.status === "approved") return "completed";
  if (inspection.status === "completed") return "completed";
  if (inspection.status === "rejected") return "rejected";

  return (inspection.completion_percentage ?? 0) > 0 ? "in_progress" : "draft";
}

export function isInspectionStarted(inspection?: InspectionLike | null): boolean {
  return (inspection?.completion_percentage ?? 0) > 0;
}

export function getInspectionApprovalLabel(inspection?: InspectionLike | null): string | null {
  if (!inspection) return null;
  if (inspection.status === "approved") return "Approved";
  if (inspection.status === "rejected") return "Rejected";
  return null;
}
