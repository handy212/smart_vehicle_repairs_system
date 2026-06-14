import type { WorkOrder } from "@/lib/api/workorders";

type AssigneeRole = "technician" | "coordinator";

export interface WorkOrderAssignee {
  id: number | string;
  name: string;
  role: AssigneeRole;
}

function getFullName(person?: {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
} | null): string {
  if (!person) return "";
  if (person.full_name) return person.full_name.trim();
  if (person.name) return person.name.trim();
  return `${person.first_name || ""} ${person.last_name || ""}`.trim();
}

export function getWorkOrderAssignees(workOrder?: WorkOrder | null): WorkOrderAssignee[] {
  if (!workOrder) return [];

  const assignees: WorkOrderAssignee[] = [];
  const seen = new Set<string>();

  const pushAssignee = (assignee: WorkOrderAssignee | null) => {
    if (!assignee?.name) return;
    const key = `${assignee.role}:${String(assignee.id)}`;
    if (seen.has(key)) return;
    seen.add(key);
    assignees.push(assignee);
  };

  for (const tech of workOrder.assigned_technicians_detail || []) {
    pushAssignee({
      id: tech.id,
      name: tech.name,
      role: "technician",
    });
  }

  if (assignees.length === 0) {
    const primary = workOrder.primary_technician;
    if (primary && typeof primary === "object") {
      pushAssignee({
        id: primary.id,
        name: getFullName(primary),
        role: "technician",
      });
    } else if (workOrder.primary_technician_name) {
      pushAssignee({
        id: workOrder.primary_technician_name,
        name: workOrder.primary_technician_name,
        role: "technician",
      });
    }
  }

  const coordinator = workOrder.service_coordinator;
  if (coordinator && typeof coordinator === "object") {
    pushAssignee({
      id: coordinator.id,
      name: getFullName(coordinator),
      role: "coordinator",
    });
  } else if (workOrder.service_coordinator_name) {
    pushAssignee({
      id: workOrder.service_coordinator_name,
      name: workOrder.service_coordinator_name,
      role: "coordinator",
    });
  }

  return assignees;
}

export function getWorkOrderTechnicianAssignees(workOrder?: WorkOrder | null): WorkOrderAssignee[] {
  return getWorkOrderAssignees(workOrder).filter((assignee) => assignee.role === "technician");
}
