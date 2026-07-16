/** Technician-focused status filters aligned with backend WO statuses. */
export const MOBILE_WO_STATUS_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "quality_check", label: "QC" },
  { value: "completed", label: "Completed" },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  inspection: "bg-primary/10 text-primary",
  intake: "bg-info/15 text-info",
  assigned: "bg-primary/10 text-primary",
  diagnosis: "bg-warning/15 text-warning",
  awaiting_approval: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  in_progress: "bg-info/15 text-info",
  additional_work_found: "bg-warning/15 text-warning",
  paused: "bg-warning/15 text-warning",
  quality_check: "bg-success/15 text-success",
  discontinued_pending_bill: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  invoiced: "bg-info/15 text-info",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export function getMobileWorkOrderStatusBadgeClass(status: string | undefined): string {
  if (!status) return "bg-muted text-muted-foreground";
  return STATUS_BADGE_CLASSES[status] ?? "bg-muted text-muted-foreground";
}
