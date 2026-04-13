import apiClient from "./client";

export interface WorkOrderPart {
  id: number;
  work_order: number;
  task?: number;
  inventory_part?: number;
  part_number: string;
  part_name: string;
  description?: string;
  quantity: number;
  unit_cost: string;
  markup_percentage?: number;
  total_cost: string;
  status: string;
  warranty_months?: number;
  warranty_notes?: string;
  resolution_notes?: string;
  installed_at?: string;
  installed_by?: number | { id: number; first_name: string; last_name: string };
  installed_by_name?: string;

  // Requisition Details
  requisition_number?: string;
  requested_by?: number;
  requested_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;

  created_at: string;
}

export interface WorkOrderPartListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkOrderPart[];
}

export const workOrderPartsApi = {
  list: async (params?: {
    work_order?: number;
    status?: string;
  }): Promise<WorkOrderPart[]> => {
    const response = await apiClient.get("/workorders/parts/", { params });
    return response.data.results || response.data;
  },

  get: async (id: number): Promise<WorkOrderPart> => {
    const response = await apiClient.get(`/workorders/parts/${id}/`);
    return response.data;
  },

  create: async (data: Partial<WorkOrderPart>): Promise<WorkOrderPart> => {
    const response = await apiClient.post("/workorders/parts/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<WorkOrderPart>): Promise<WorkOrderPart> => {
    const response = await apiClient.put(`/workorders/parts/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/parts/${id}/`);
  },

  markInstalled: async (id: number): Promise<WorkOrderPart> => {
    const response = await apiClient.post(`/workorders/parts/${id}/mark_installed/`);
    return response.data;
  },

  markReturned: async (id: number, reason: string): Promise<WorkOrderPart> => {
    const response = await apiClient.post(`/workorders/parts/${id}/mark_returned/`, { reason });
    return response.data;
  },

  approve: async (id: number): Promise<WorkOrderPart> => {
    const response = await apiClient.post(`/workorders/parts/${id}/approve/`);
    return response.data;
  },
};
