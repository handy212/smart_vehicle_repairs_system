import apiClient from "./client";

export interface WorkOrderNote {
  id: number;
  work_order: number;
  note_type: string;
  note: string;
  is_important: boolean;
  is_customer_visible: boolean;
  created_by?: number | { id: number; first_name: string; last_name: string };
  created_by_name?: string;
  created_at: string;
}

export interface WorkOrderNoteListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkOrderNote[];
}

export const workOrderNotesApi = {
  list: async (params?: {
    work_order?: number;
    note_type?: string;
    is_important?: boolean;
  }): Promise<WorkOrderNote[]> => {
    const response = await apiClient.get("/workorders/notes/", { params });
    return response.data.results || response.data;
  },

  get: async (id: number): Promise<WorkOrderNote> => {
    const response = await apiClient.get(`/workorders/notes/${id}/`);
    return response.data;
  },

  create: async (data: Partial<WorkOrderNote>): Promise<WorkOrderNote> => {
    const response = await apiClient.post("/workorders/notes/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<WorkOrderNote>): Promise<WorkOrderNote> => {
    const response = await apiClient.put(`/workorders/notes/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/notes/${id}/`);
  },
};

