import type { ServiceTask } from "@/lib/api/workorder-tasks";

/** Tasks eligible for shop labor timers (repair + diagnosis phase). */
export function isLaborEligibleTask(task: ServiceTask): boolean {
  if (task.status === "completed" || task.status === "skipped") return false;
  // Repair / mechanical tasks
  if (!task.is_workflow_task) return true;
  // Diagnosis workflow phase task ("Perform Diagnosis")
  if (task.workflow_phase === "diagnosis" || task.task_type === "diagnostic") {
    return true;
  }
  return false;
}

export function taskAssigneeId(task: ServiceTask): number | null {
  if (task.assigned_to == null) return null;
  if (typeof task.assigned_to === "number") return task.assigned_to;
  return task.assigned_to.id ?? null;
}

export function filterSelectableLaborTasks(
  tasks: ServiceTask[],
  options: { userId?: number | null; canPickAny?: boolean } = {},
): ServiceTask[] {
  const { userId, canPickAny = false } = options;
  return tasks.filter((task) => {
    if (!isLaborEligibleTask(task)) return false;
    if (canPickAny) return true;
    if (userId == null) return false;
    const assignee = taskAssigneeId(task);
    return assignee === userId || assignee == null;
  });
}
