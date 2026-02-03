import apiClient from "./client";
import { Customer } from "./customers";
import { Vehicle } from "./vehicles";
import { WorkOrder } from "./workorders";

export interface GatePass {
  id: number;
  gate_pass_number: string;
  work_order: number | WorkOrder;
  work_order_number?: string;
  branch: number | { id: number; name: string; code: string };
  vehicle: number | Vehicle;
  vehicle_info?: string;
  customer: number | Customer;
  customer_name?: string;
  picked_up_by_customer: boolean;
  pickup_person_name?: string;
  pickup_person_relationship?: string;
  pickup_person_id_type?: string;
  pickup_person_id_number?: string;
  pickup_person_phone?: string;
  pickup_notes?: string;
  pickup_person_display?: string;
  status: "pending" | "issued" | "completed" | "cancelled";
  issued_at?: string;
  completed_at?: string;
  issued_by: number | { id: number; first_name: string; last_name: string };
  issued_by_name?: string;
  authorized_by?: number | { id: number; first_name: string; last_name: string };
  authorized_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface GatePassListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GatePass[];
}

export interface GatePassCreateData {
  work_order: number;
  branch?: number;
  vehicle?: number;
  customer?: number;
  picked_up_by_customer: boolean;
  pickup_person_name?: string;
  pickup_person_relationship?: string;
  pickup_person_id_type?: string;
  pickup_person_id_number?: string;
  pickup_person_phone?: string;
  pickup_notes?: string;
}

export interface GatePassUpdateData {
  picked_up_by_customer?: boolean;
  pickup_person_name?: string;
  pickup_person_relationship?: string;
  pickup_person_id_type?: string;
  pickup_person_id_number?: string;
  pickup_person_phone?: string;
  pickup_notes?: string;
}

export const gatepassApi = {
  list: async (params?: {
    page?: number;
    status?: string;
    work_order?: number;
    customer?: number;
    vehicle?: number;
    branch?: number;
    search?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
  }): Promise<GatePassListResponse> => {
    const response = await apiClient.get("/gatepass/gate-passes/", { params });
    return response.data;
  },

  get: async (id: number): Promise<GatePass> => {
    const response = await apiClient.get(`/gatepass/gate-passes/${id}/`);
    return response.data;
  },

  create: async (data: GatePassCreateData): Promise<GatePass> => {
    const response = await apiClient.post("/gatepass/gate-passes/", data);
    return response.data;
  },

  update: async (id: number, data: GatePassUpdateData): Promise<GatePass> => {
    const response = await apiClient.patch(`/gatepass/gate-passes/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/gatepass/gate-passes/${id}/`);
  },

  issue: async (id: number): Promise<GatePass> => {
    const response = await apiClient.post(`/gatepass/gate-passes/${id}/issue/`);
    return response.data;
  },

  complete: async (id: number): Promise<GatePass> => {
    const response = await apiClient.post(`/gatepass/gate-passes/${id}/complete/`);
    return response.data;
  },

  cancel: async (id: number): Promise<GatePass> => {
    const response = await apiClient.post(`/gatepass/gate-passes/${id}/cancel/`);
    return response.data;
  },

  getByWorkOrder: async (workOrderId: number): Promise<GatePass | null> => {
    try {
      const response = await apiClient.get(`/gatepass/gate-passes/from-workorder/${workOrderId}/`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },
};
