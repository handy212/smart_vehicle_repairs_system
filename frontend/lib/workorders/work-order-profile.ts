import type { WorkOrder } from "@/lib/api/workorders";
import {
  getWorkflowProfileCode,
  getWorkflowStepIndexForWorkOrder,
  getWorkflowStepsForWorkOrder,
  isDiagnosticOnlyWorkOrder,
  isInspectionOnlyWorkOrder,
  isRoutineMaintenanceWorkOrder,
  type WorkflowWorkOrderContext,
} from "@/lib/utils/workorder-workflow-steps";

export interface WorkOrderProfileContext {
  profileCode: string | null;
  isRoutine: boolean;
  isInspectionOnly: boolean;
  isDiagnosticOnly: boolean;
  isFastTrack: boolean;
  skipsDiagnosis: boolean;
  allowsSimplifiedCompletion: boolean;
}

type WorkOrderProfileInput = WorkflowWorkOrderContext | Partial<WorkOrder>;

export function getWorkOrderProfile(
  workOrder?: WorkOrderProfileInput | null
): WorkOrderProfileContext {
  const profileCode = getWorkflowProfileCode(workOrder);
  const isRoutine = isRoutineMaintenanceWorkOrder(workOrder);
  const isInspectionOnly = isInspectionOnlyWorkOrder(workOrder);
  const isDiagnosticOnly = isDiagnosticOnlyWorkOrder(workOrder);

  return {
    profileCode,
    isRoutine,
    isInspectionOnly,
    isDiagnosticOnly,
    isFastTrack: profileCode === "routine_fast_track" || isRoutine,
    skipsDiagnosis: profileCode === "inspection_only" || isInspectionOnly,
    allowsSimplifiedCompletion: isInspectionOnly || isDiagnosticOnly,
  };
}

export function workOrderSkipsRepairs(
  workOrder?: WorkOrderProfileInput | null
): boolean {
  const profile = getWorkOrderProfile(workOrder);
  return profile.isInspectionOnly || profile.isDiagnosticOnly;
}

export function workOrderShowsDiagnosisTab(
  workOrder?: WorkOrderProfileInput | null
): boolean {
  if (!workOrder) return false;
  const profile = getWorkOrderProfile(workOrder);
  return !profile.isRoutine && !profile.isInspectionOnly;
}

export { getWorkflowStepsForWorkOrder, getWorkflowStepIndexForWorkOrder };
