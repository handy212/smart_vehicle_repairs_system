"use client";

import { useMemo } from "react";
import type { WorkOrder } from "@/lib/api/workorders";
import {
  getWorkOrderProfile,
  type WorkOrderProfileContext,
} from "@/lib/workorders/work-order-profile";
import type { WorkflowWorkOrderContext } from "@/lib/utils/workorder-workflow-steps";

export function useWorkOrderProfile(
  workOrder?: (WorkflowWorkOrderContext & Partial<WorkOrder>) | null
): WorkOrderProfileContext {
  return useMemo(() => getWorkOrderProfile(workOrder), [workOrder]);
}
