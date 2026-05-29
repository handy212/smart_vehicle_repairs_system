import type { RoadsideAssignmentStatus, RoadsideRequest } from "@/lib/api/roadside";

function assignedTechnicianId(request: RoadsideRequest): number | null {
  const t = request.assigned_technician;
  if (typeof t === "number") return t;
  return null;
}

/** Resolve assignment state when API omits dispatch row (legacy primary assignee). */
export function getEffectiveAssignmentStatus(
  request: RoadsideRequest,
  userId?: number | null
): RoadsideAssignmentStatus | null | undefined {
  if (request.my_assignment_status) {
    return request.my_assignment_status;
  }

  if (!userId || assignedTechnicianId(request) !== userId) {
    return request.my_assignment_status;
  }

  if (["en_route", "on_site", "in_progress", "completed"].includes(request.status)) {
    return "accepted";
  }

  if (["dispatched", "requested"].includes(request.status)) {
    return "pending";
  }

  return request.my_assignment_status;
}

export function isAssignmentAccepted(
  request: RoadsideRequest,
  userId?: number | null
): boolean {
  return getEffectiveAssignmentStatus(request, userId) === "accepted";
}
