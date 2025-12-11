import apiClient from "./client";
import { Customer } from "./customers";
import { Vehicle } from "./vehicles";

export interface WorkOrder {
  id: number;
  work_order_number: string;
  customer: number | Customer;
  customer_name?: string;
  vehicle: number | Vehicle;
  vehicle_info?: string;
  status: string;
  priority: string;
  total_cost?: string;
  created_at: string;
  completed_at?: string;
  started_at?: string;
  estimated_completion?: string;
  customer_concerns?: string;
  diagnosis_notes?: string;
  special_instructions?: string;
  requires_approval?: boolean;
  approved_by_customer?: boolean;
  approved_at?: string;
  approval_requested_at?: string;
  diagnosis_completed_at?: string;
  diagnosis_by?: number;
  primary_technician?: number | { id: number; first_name: string; last_name: string };
  primary_technician_name?: string;
  service_coordinator?: number | { id: number; first_name: string; last_name: string };
  service_coordinator_name?: string;
  estimated_labor_cost?: string;
  estimated_parts_cost?: string;
  estimated_total?: string;
  actual_total?: string;
  quality_check_required?: boolean;
  quality_check_completed?: boolean;
  quality_check_passed?: boolean;
  odometer_out?: number;
  is_overdue?: boolean;
  days_in_shop?: number;
  is_approved?: boolean;
  is_warranty_rework?: boolean;
  related_work_order?: number | {
    id: number;
    work_order_number: string;
    completed_at?: string;
    status: string;
  };
  related_work_order_detail?: {
    id: number;
    work_order_number: string;
    completed_at?: string;
    status: string;
  };
  rework_work_orders?: Array<{
    id: number;
    work_order_number: string;
    created_at: string;
    status: string;
  }>;
  warranty_reason?: string;
}

export interface WorkOrderListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkOrder[];
}

export const workordersApi = {
  list: async (params?: {
    page?: number;
    status?: string;
    customer?: number;
    priority?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
  }): Promise<WorkOrderListResponse> => {
    const response = await apiClient.get("/workorders/work-orders/", { params });
    return response.data;
  },

  get: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/`);
    return response.data;
  },

  create: async (data: Partial<WorkOrder>): Promise<WorkOrder> => {
    const response = await apiClient.post("/workorders/work-orders/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<WorkOrder>): Promise<WorkOrder> => {
    try {
      // Use PATCH for partial updates (only send the fields that are being updated)
      const response = await apiClient.patch(`/workorders/work-orders/${id}/`, data);
      return response.data;
    } catch (error: any) {
      console.error("Work order update error:", error);
      console.error("Update data:", data);
      console.error("Error response:", error.response?.data);
      throw error;
    }
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/work-orders/${id}/`);
  },

  active: async (): Promise<WorkOrder[]> => {
    const response = await apiClient.get("/workorders/work-orders/active/");
    return response.data;
  },

  updateStatus: async (id: number, status: string): Promise<WorkOrder> => {
    const response = await apiClient.patch(`/workorders/work-orders/${id}/`, { status });
    return response.data;
  },

  // Workflow Actions
  startIntake: async (id: number, data?: { service_coordinator?: number }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_intake/`, data || {});
    return response.data;
  },

  startDiagnosis: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_diagnosis/`);
    return response.data;
  },

  completeDiagnosis: async (
    id: number,
    data: {
      diagnosis_notes?: string;
      requires_approval?: boolean;
      estimated_labor_hours?: number;
      estimated_labor_cost?: string;
      estimated_parts_cost?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/complete_diagnosis/`, data);
    return response.data;
  },

  requestApproval: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/request_approval/`);
    return response.data;
  },

  approve: async (
    id: number,
    data?: {
      approval_method?: string;
      approval_notes?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/approve/`, data || {});
    return response.data;
  },

  startWork: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_work/`);
    return response.data;
  },

  pause: async (id: number, reason?: string): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/pause/`, { reason });
    return response.data;
  },

  resume: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/resume/`);
    return response.data;
  },

  requestQualityCheck: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/request_quality_check/`);
    return response.data;
  },

  qualityCheck: async (
    id: number,
    data: {
      passed: boolean;
      notes?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/quality_check/`, data);
    return response.data;
  },

  complete: async (
    id: number,
    data?: {
      odometer_out?: number;
      completion_notes?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/complete/`, data || {});
    return response.data;
  },

  markInvoiced: async (id: number, data?: { odometer_out?: number }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/mark_invoiced/`, data || {});
    return response.data;
  },

  close: async (id: number, data?: { payment_received?: boolean; closing_notes?: string }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/close/`, data || {});
    return response.data;
  },

  reopen: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/reopen/`);
    return response.data;
  },

  checkReadiness: async (id: number): Promise<{
    can_start: boolean;
    errors: string[];
    unavailable_parts: Array<{ part_name: string; reason: string }>;
  }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/check_readiness/`);
    return response.data;
  },

  checkRepeatVisit: async (data: {
    vehicle: number;
    customer_concerns: string;
  }): Promise<{
    has_repeat: boolean;
    matches: Array<{
      work_order_id: number;
      work_order_number: string;
      completed_at: string;
      days_ago: number;
      customer_concerns: string;
      similarity: number;
      technician: string;
      branch_name: string;
    }>;
  }> => {
    const response = await apiClient.post("/workorders/work-orders/check_repeat_visit/", data);
    return response.data;
  },
};

