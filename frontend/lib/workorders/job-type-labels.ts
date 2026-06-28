/** UI labels for work order job type (maintenance_type) and routine service packages. */

export const JOB_TYPE_FIELD_LABEL = "Job type";
export const JOB_TYPE_GENERAL_LABEL = "General repair";
export const JOB_TYPE_ROUTINE_LABEL = "Routine service";
export const SERVICE_PACKAGE_LABEL = "Service package";
export const SERVICE_PACKAGE_PLACEHOLDER = "Select service package";

export function getJobTypeLabel(maintenanceType?: string | null): string {
  if (maintenanceType === "routine") return JOB_TYPE_ROUTINE_LABEL;
  return JOB_TYPE_GENERAL_LABEL;
}

export function getServicePackageName(workOrder: {
  service_bundle?: { name?: string } | number | null;
  service_type?: { name?: string } | number | null;
} | null | undefined): string | null {
  if (!workOrder) return null;
  if (typeof workOrder.service_bundle === "object" && workOrder.service_bundle?.name) {
    return workOrder.service_bundle.name;
  }
  if (typeof workOrder.service_type === "object" && workOrder.service_type?.name) {
    return workOrder.service_type.name;
  }
  return null;
}
