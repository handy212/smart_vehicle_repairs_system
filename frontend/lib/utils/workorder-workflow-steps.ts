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

export function isRoutineMaintenanceWorkOrder(
  workOrder?: { maintenance_type?: string } | null
): boolean {
  return workOrder?.maintenance_type === "routine";
}

export function getWorkflowStepsForWorkOrder(
  workOrder?: { maintenance_type?: string } | null
): WorkflowStep[] {
  return isRoutineMaintenanceWorkOrder(workOrder) ? ROUTINE_WORKFLOW_STEPS : WORKFLOW_STEPS;
}

export function getWorkflowStepIndex(
  status: string,
  context?: { diagnosisStatus?: string | null; maintenanceType?: string | null }
): number {
  if (context?.maintenanceType === "routine") {
    return ROUTINE_STATUS_ORDER[status] ?? 0;
  }
  if (status === "paused" && context?.diagnosisStatus === "paused") {
    return WORKFLOW_STATUS_ORDER.diagnosis;
  }
  return WORKFLOW_STATUS_ORDER[status] ?? 0;
}

export function getWorkflowStepIndexForWorkOrder(
  status: string,
  workOrder?: { maintenance_type?: string; diagnosis_status?: string | null } | null
): number {
  return getWorkflowStepIndex(status, {
    diagnosisStatus: workOrder?.diagnosis_status,
    maintenanceType: workOrder?.maintenance_type,
  });
}
