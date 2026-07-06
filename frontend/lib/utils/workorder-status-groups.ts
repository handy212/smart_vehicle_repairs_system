import { WORK_ORDER_STATUSES } from "./workorder-status";

/** Simplified status groups for filters and operational views. */
export const WORK_ORDER_STATUS_GROUPS = [
  {
    id: "waiting",
    label: "Waiting",
    description: "Intake, inspection, assignment, approval",
    statuses: [
      "draft",
      "inspection",
      "intake",
      "assigned",
      "awaiting_approval",
    ],
  },
  {
    id: "active",
    label: "Active",
    description: "Diagnosis through quality check",
    statuses: [
      "diagnosis",
      "approved",
      "in_progress",
      "additional_work_found",
      "paused",
      "quality_check",
    ],
  },
  {
    id: "billing",
    label: "Billing",
    description: "Completed work pending or with invoice",
    statuses: ["discontinued_pending_bill", "completed", "invoiced"],
  },
  {
    id: "done",
    label: "Done",
    statuses: ["closed"],
  },
  {
    id: "cancelled",
    label: "Cancelled",
    statuses: ["cancelled"],
  },
] as const;

export type WorkOrderStatusGroupId = (typeof WORK_ORDER_STATUS_GROUPS)[number]["id"];

/** Dashboard deep-link groups (legacy) mapped to status lists. */
export const DASHBOARD_GROUP_STATUS_MAP: Record<string, string[]> = {
  intake: ["intake", "inspection"],
  diagnosis: ["diagnosis", "awaiting_approval"],
  repair: ["assigned", "in_progress", "additional_work_found"],
  qc: ["quality_check"],
  ready: ["completed"],
};

export function getStatusesForGroup(groupId: string): string[] {
  const group = WORK_ORDER_STATUS_GROUPS.find((g) => g.id === groupId);
  return group ? [...group.statuses] : DASHBOARD_GROUP_STATUS_MAP[groupId] ?? [];
}

/** Comma-separated status string for API list filters. */
export function getStatusGroupFilterValue(groupId: string): string {
  return getStatusesForGroup(groupId).join(",");
}

export function getStatusGroupForStatus(status: string): WorkOrderStatusGroupId | null {
  const group = WORK_ORDER_STATUS_GROUPS.find((g) =>
    (g.statuses as readonly string[]).includes(status)
  );
  return group?.id ?? null;
}

export function getStatusGroupLabel(groupId: string): string {
  return WORK_ORDER_STATUS_GROUPS.find((g) => g.id === groupId)?.label ?? groupId;
}

/** Flat select options with group headers for advanced filters. */
export function getGroupedStatusFilterOptions(): { value: string; label: string; group?: string }[] {
  return WORK_ORDER_STATUS_GROUPS.flatMap((group) =>
    group.statuses.map((status) => {
      const def = WORK_ORDER_STATUSES.find((s) => s.value === status);
      return {
        value: status,
        label: def?.label ?? status.replace(/_/g, " "),
        group: group.label,
      };
    })
  );
}

/** Primary status applied when a card is dropped into a kanban group column. */
export function getDefaultStatusForGroup(groupId: string): string {
  const defaults: Record<string, string> = {
    waiting: "assigned",
    active: "in_progress",
    billing: "completed",
    done: "closed",
    cancelled: "cancelled",
  };
  return defaults[groupId] ?? "assigned";
}

/** Group work orders by status group id for kanban columns. */
export function groupWorkOrdersByStatusGroup<T extends { status: string }>(
  workOrders: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  WORK_ORDER_STATUS_GROUPS.forEach((group) => {
    grouped[group.id] = [];
  });
  workOrders.forEach((wo) => {
    const groupId = getStatusGroupForStatus(wo.status);
    if (groupId && grouped[groupId]) {
      grouped[groupId].push(wo);
    }
  });
  return grouped;
}
