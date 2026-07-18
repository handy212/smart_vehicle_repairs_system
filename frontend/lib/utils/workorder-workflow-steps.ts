import type { LucideIcon } from "lucide-react";
import {
  FileEdit,
  Search,
  ClipboardList,
  UserCheck,
  Stethoscope,
  Hourglass,
  CheckCircle2,
  Cog,
  ShieldCheck,
  PartyPopper,
  Receipt,
  Lock,
  AlertTriangle,
} from "lucide-react";

export interface WorkflowStep {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "draft", label: "Draft", icon: FileEdit },
  { key: "inspection", label: "Inspection", icon: Search },
  { key: "intake", label: "Intake", icon: ClipboardList },
  { key: "assigned", label: "Assigned", icon: UserCheck },
  { key: "diagnosis", label: "Diagnosis", icon: Stethoscope },
  { key: "awaiting_approval", label: "Awaiting Approval", icon: Hourglass },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "in_progress", label: "In Progress", icon: Cog },
  { key: "quality_check", label: "Quality Check", icon: ShieldCheck },
  {
    key: "discontinued_pending_bill",
    label: "Discontinued (pending invoice)",
    icon: AlertTriangle,
  },
  { key: "completed", label: "Repair Complete", icon: PartyPopper },
  { key: "invoiced", label: "Ready to Close", icon: Receipt },
  { key: "closed", label: "Closed", icon: Lock },
];

export const WORKFLOW_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  inspection: 1,
  intake: 2,
  assigned: 3,
  diagnosis: 4,
  awaiting_approval: 5,
  approved: 6,
  in_progress: 7,
  additional_work_found: 7,
  paused: 7,
  quality_check: 8,
  discontinued_pending_bill: 9,
  completed: 10,
  invoiced: 11,
  closed: 12,
};

export const ROUTINE_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "check_in", label: "Check-in", icon: FileEdit },
  { key: "approved", label: "Ready for Service", icon: CheckCircle2 },
  { key: "in_progress", label: "Service In Progress", icon: Cog },
  { key: "completed", label: "Complete", icon: PartyPopper },
  { key: "invoiced", label: "Invoiced", icon: Receipt },
  { key: "closed", label: "Closed", icon: Lock },
];

export const ROUTINE_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  inspection: 0,
  intake: 0,
  assigned: 0,
  diagnosis: 0,
  awaiting_approval: 0,
  approved: 1,
  in_progress: 2,
  additional_work_found: 2,
  paused: 2,
  quality_check: 2,
  discontinued_pending_bill: 3,
  completed: 3,
  invoiced: 4,
  closed: 5,
};

export const INSPECTION_ONLY_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "draft", label: "Draft", icon: FileEdit },
  { key: "inspection", label: "Inspection", icon: Search },
  { key: "completed", label: "Inspection Complete", icon: PartyPopper },
  { key: "invoiced", label: "Invoiced", icon: Receipt },
  { key: "closed", label: "Closed", icon: Lock },
];

export const INSPECTION_ONLY_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  inspection: 1,
  intake: 1,
  assigned: 1,
  diagnosis: 1,
  awaiting_approval: 1,
  approved: 1,
  in_progress: 1,
  additional_work_found: 1,
  paused: 1,
  quality_check: 1,
  discontinued_pending_bill: 2,
  completed: 2,
  invoiced: 3,
  closed: 4,
};

export const DIAGNOSTIC_ONLY_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "draft", label: "Draft", icon: FileEdit },
  { key: "inspection", label: "Inspection", icon: Search },
  { key: "intake", label: "Intake", icon: ClipboardList },
  { key: "assigned", label: "Assigned", icon: UserCheck },
  { key: "diagnosis", label: "Diagnosis", icon: Stethoscope },
  { key: "awaiting_approval", label: "Estimate Ready", icon: Hourglass },
  { key: "completed", label: "Diagnostic Complete", icon: PartyPopper },
  { key: "invoiced", label: "Invoiced", icon: Receipt },
  { key: "closed", label: "Closed", icon: Lock },
];

export const DIAGNOSTIC_ONLY_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  inspection: 1,
  intake: 2,
  assigned: 3,
  diagnosis: 4,
  awaiting_approval: 5,
  approved: 5,
  in_progress: 5,
  additional_work_found: 5,
  paused: 4,
  quality_check: 5,
  discontinued_pending_bill: 6,
  completed: 6,
  invoiced: 7,
  closed: 8,
};

export type WorkflowWorkOrderContext = {
  status?: string;
  maintenance_type?: string;
  workflow_profile_code?: string | null;
  job_type_detail?: { workflow_profile?: { code?: string } } | null;
  diagnosis_status?: string | null;
};

export function getWorkflowProfileCode(
  workOrder?: WorkflowWorkOrderContext | null
): string | null {
  return (
    workOrder?.workflow_profile_code ??
    workOrder?.job_type_detail?.workflow_profile?.code ??
    null
  );
}

export function isInspectionOnlyWorkOrder(workOrder?: WorkflowWorkOrderContext | null): boolean {
  return getWorkflowProfileCode(workOrder) === "inspection_only";
}

export function isDiagnosticOnlyWorkOrder(workOrder?: WorkflowWorkOrderContext | null): boolean {
  return getWorkflowProfileCode(workOrder) === "diagnostic_only";
}

export function isRoutineMaintenanceWorkOrder(
  workOrder?: WorkflowWorkOrderContext | null
): boolean {
  if (getWorkflowProfileCode(workOrder) === "routine_fast_track") return true;
  return workOrder?.maintenance_type === "routine";
}

export function getWorkflowStepsForWorkOrder(
  workOrder?: WorkflowWorkOrderContext | null
): WorkflowStep[] {
  const profile = getWorkflowProfileCode(workOrder);
  if (profile === "inspection_only") return INSPECTION_ONLY_WORKFLOW_STEPS;
  if (profile === "diagnostic_only") return DIAGNOSTIC_ONLY_WORKFLOW_STEPS;
  if (isRoutineMaintenanceWorkOrder(workOrder)) return ROUTINE_WORKFLOW_STEPS;
  return WORKFLOW_STEPS;
}

export function getWorkflowStepIndex(
  status: string,
  context?: {
    diagnosisStatus?: string | null;
    maintenanceType?: string | null;
    workflowProfile?: string | null;
  }
): number {
  if (context?.workflowProfile === "inspection_only") {
    return INSPECTION_ONLY_STATUS_ORDER[status] ?? 0;
  }
  if (context?.workflowProfile === "diagnostic_only") {
    if (status === "paused" && context?.diagnosisStatus === "paused") {
      return DIAGNOSTIC_ONLY_STATUS_ORDER.diagnosis;
    }
    return DIAGNOSTIC_ONLY_STATUS_ORDER[status] ?? 0;
  }
  if (context?.maintenanceType === "routine" || context?.workflowProfile === "routine_fast_track") {
    return ROUTINE_STATUS_ORDER[status] ?? 0;
  }
  if (status === "paused" && context?.diagnosisStatus === "paused") {
    return WORKFLOW_STATUS_ORDER.diagnosis;
  }
  return WORKFLOW_STATUS_ORDER[status] ?? 0;
}

export function getWorkflowStepIndexForWorkOrder(
  status: string,
  workOrder?: WorkflowWorkOrderContext | null
): number {
  const profile = getWorkflowProfileCode(workOrder);
  return getWorkflowStepIndex(status, {
    diagnosisStatus: workOrder?.diagnosis_status,
    maintenanceType: isRoutineMaintenanceWorkOrder(workOrder) ? "routine" : workOrder?.maintenance_type,
    workflowProfile: profile,
  });
}
