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
  inspection: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  intake: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  diagnosis: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  awaiting_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  in_progress: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  additional_work_found: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  quality_check: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  discontinued_pending_bill: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  invoiced: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export function getMobileWorkOrderStatusBadgeClass(status: string | undefined): string {
  if (!status) return "bg-muted text-muted-foreground";
  return STATUS_BADGE_CLASSES[status] ?? "bg-muted text-muted-foreground";
}
