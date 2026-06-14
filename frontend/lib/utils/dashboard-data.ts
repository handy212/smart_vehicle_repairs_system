import type { WorkOrder } from "@/lib/api/workorders";
import type { Part } from "@/lib/api/inventory";

export interface DashboardWorkOrderSummary {
  pending_count?: number;
  active_count?: number;
  attention_count?: number;
  completed?: number;
  average_completion_hours?: number;
  total_work_orders?: number;
}

export interface DashboardStatusCount {
  status: string;
  count: number;
  label?: string;
}

export interface DashboardRecentWorkOrder {
  id: number;
  wo_number: string;
  status: string;
  created_at: string;
  diagnosis_status?: WorkOrder["diagnosis_status"];
  diagnosis_notes?: string;
  customer?: string;
  vehicle?: string;
  gate_pass_status?: string;
  has_technician_assignment?: boolean;
  estimate_summary?: WorkOrder["estimate_summary"];
  invoice_summary?: WorkOrder["invoice_summary"];
  current_quote_stage?: WorkOrder["current_quote_stage"];
  current_quote_stage_display?: WorkOrder["current_quote_stage_display"];
}

export function buildSummaryFromDashboardStats(stats?: {
  total_workorders?: number;
  pending?: number;
  in_progress?: number;
  completed?: number;
  cancelled?: number;
}): DashboardWorkOrderSummary | undefined {
  if (!stats) return undefined;
  return {
    total_work_orders: stats.total_workorders,
    pending_count: stats.pending,
    active_count: stats.in_progress,
    completed: stats.completed,
  };
}

export function buildStatusCountsFromDashboardStats(stats?: {
  pending?: number;
  in_progress?: number;
  completed?: number;
  cancelled?: number;
}): DashboardStatusCount[] | undefined {
  if (!stats) return undefined;
  return [
    { status: "pending", count: stats.pending ?? 0, label: "Pending" },
    { status: "in_progress", count: stats.in_progress ?? 0, label: "In Progress" },
    { status: "completed", count: stats.completed ?? 0, label: "Completed" },
    { status: "cancelled", count: stats.cancelled ?? 0, label: "Cancelled" },
  ].filter((row) => row.count > 0);
}

export function mapWorkOrderToDashboardRecent(workOrder: WorkOrder): DashboardRecentWorkOrder {
  const customer =
    workOrder.customer_name ||
    (typeof workOrder.customer === "object" && workOrder.customer
      ? workOrder.customer.full_name || workOrder.customer.company_name
      : undefined);

  return {
    id: workOrder.id,
    wo_number: workOrder.work_order_number,
    status: workOrder.status,
    diagnosis_status: workOrder.diagnosis_status ?? null,
    has_technician_assignment: workOrder.has_technician_assignment ?? false,
    estimate_summary: workOrder.estimate_summary ?? null,
    invoice_summary: workOrder.invoice_summary ?? null,
    current_quote_stage: workOrder.current_quote_stage ?? null,
    current_quote_stage_display: workOrder.current_quote_stage_display ?? null,
    created_at: workOrder.created_at,
    diagnosis_notes: workOrder.diagnosis_notes,
    customer: customer || undefined,
    vehicle: workOrder.vehicle_info || workOrder.vehicle_display,
    gate_pass_status: (workOrder as WorkOrder & { gate_pass_status?: string }).gate_pass_status,
  };
}

export function mapInventoryLowStock(parts: Part[]) {
  return parts.map((part) => ({
    id: part.id,
    name: part.name,
    part_number: part.part_number,
    quantity: Number(part.quantity_in_stock ?? 0),
    reorder_point: Number(part.reorder_point ?? 0),
  }));
}
