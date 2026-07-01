import type { WorkOrder } from "@/lib/api/workorders";
import { getStatusesForGroup, type WorkOrderStatusGroupId } from "./workorder-status-groups";
import { isDiagnosisPausedWorkOrder } from "./workorder-inspection-stage";
import {
  getWorkflowProfileCode,
  type WorkflowWorkOrderContext,
} from "./workorder-workflow-steps";

/** Mirrors backend WorkOrder.VALID_TRANSITIONS for client-side guards. */
export const WORK_ORDER_VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["inspection"],
  inspection: ["intake", "draft", "discontinued_pending_bill"],
  intake: ["assigned", "discontinued_pending_bill"],
  assigned: ["diagnosis", "intake", "discontinued_pending_bill"],
  diagnosis: ["awaiting_approval", "paused", "discontinued_pending_bill"],
  awaiting_approval: ["approved", "diagnosis", "discontinued_pending_bill"],
  approved: ["in_progress", "additional_work_found", "discontinued_pending_bill"],
  in_progress: ["paused", "quality_check", "additional_work_found", "discontinued_pending_bill"],
  additional_work_found: ["awaiting_approval", "discontinued_pending_bill"],
  paused: ["diagnosis", "in_progress", "additional_work_found", "discontinued_pending_bill"],
  quality_check: ["completed", "in_progress", "discontinued_pending_bill"],
  discontinued_pending_bill: ["invoiced"],
  completed: ["invoiced"],
  invoiced: ["closed"],
  closed: [],
};

const PROFILE_EXTRA_TRANSITIONS: Record<string, Array<[string, string]>> = {
  inspection_only: [
    ["inspection", "completed"],
  ],
  diagnostic_only: [
    ["diagnosis", "completed"],
    ["awaiting_approval", "completed"],
    ["approved", "completed"],
  ],
};

const PROFILE_BLOCKED_TRANSITIONS: Record<string, Set<string>> = {
  inspection_only: new Set([
    "inspection:intake",
    "inspection:assigned",
    "inspection:diagnosis",
    "draft:intake",
  ]),
  diagnostic_only: new Set(["approved:in_progress", "awaiting_approval:in_progress"]),
};

const TRANSITION_PRIORITY: Partial<Record<string, string[]>> = {
  waiting: ["assigned", "awaiting_approval", "intake", "inspection", "draft"],
  active: ["diagnosis", "approved", "in_progress", "quality_check", "paused", "additional_work_found"],
  billing: ["completed", "invoiced", "discontinued_pending_bill"],
  done: ["closed"],
  cancelled: ["cancelled"],
};

function resolveAllowedTargets(
  workOrder: WorkflowWorkOrderContext | null | undefined,
  currentStatus: string,
  baseTargets: string[]
): string[] {
  const profile = getWorkflowProfileCode(workOrder);
  if (!profile) return baseTargets;

  const allowed = [...baseTargets];
  const extras = PROFILE_EXTRA_TRANSITIONS[profile] ?? [];
  const blocked = PROFILE_BLOCKED_TRANSITIONS[profile] ?? new Set();

  for (const [fromStatus, toStatus] of extras) {
    if (fromStatus === currentStatus && !allowed.includes(toStatus)) {
      allowed.push(toStatus);
    }
  }

  return allowed.filter((target) => !blocked.has(`${currentStatus}:${target}`));
}

export function getValidNextStatuses(
  status: string,
  workOrder?: WorkflowWorkOrderContext | null
): string[] {
  const base = WORK_ORDER_VALID_TRANSITIONS[status] ?? [];
  return resolveAllowedTargets(workOrder, status, base);
}

export function canTransitionWorkOrderStatus(
  fromStatus: string,
  toStatus: string,
  workOrder?: WorkflowWorkOrderContext | null
): boolean {
  return getValidNextStatuses(fromStatus, workOrder).includes(toStatus);
}

/**
 * Resolve a safe target status when a kanban card is dropped into a column.
 * Returns null when the drop would skip required workflow steps.
 */
export function resolveKanbanDropStatus(
  workOrder: Pick<WorkOrder, "status" | "diagnosis_status" | "paused_from_status"> &
    WorkflowWorkOrderContext,
  targetGroupId: WorkOrderStatusGroupId
): string | null {
  const currentStatus = workOrder.status;
  const allowedNext = getValidNextStatuses(currentStatus, workOrder);
  const groupStatuses = getStatusesForGroup(targetGroupId);
  const candidates = allowedNext.filter((status) => groupStatuses.includes(status));

  if (!candidates.length) {
    return null;
  }

  const filtered = isDiagnosisPausedWorkOrder(workOrder)
    ? candidates.filter((status) => status !== "in_progress")
    : candidates;

  if (!filtered.length) {
    return null;
  }

  const priority = TRANSITION_PRIORITY[targetGroupId] ?? [];
  for (const preferred of priority) {
    if (filtered.includes(preferred)) {
      return preferred;
    }
  }

  return filtered[0] ?? null;
}
