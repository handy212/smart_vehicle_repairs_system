import apiClient from "./client";

export interface ServiceTask {
  id: number;
  work_order: number;
  task_type: string;
  description: string;
  detailed_notes?: string;
  sequence_order?: number;
  assigned_to?: number | { id: number; first_name: string; last_name: string };
  assigned_to_name?: string;
  status: string;
  estimated_hours?: number;
  actual_hours?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  // Workflow task fields
  is_workflow_task?: boolean;
  workflow_phase?: string;
}

export interface ServiceTaskListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ServiceTask[];
}

export const workOrderTasksApi = {
  list: async (params?: {
    work_order?: number;
    status?: string;
    task_type?: string;
  }): Promise<ServiceTask[]> => {
    const response = await apiClient.get("/workorders/tasks/", { params });
    return response.data.results || response.data;
  },

  get: async (id: number): Promise<ServiceTask> => {
    const response = await apiClient.get(`/workorders/tasks/${id}/`);
    return response.data;
  },

  create: async (data: Partial<ServiceTask>): Promise<ServiceTask> => {
    const response = await apiClient.post("/workorders/tasks/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<ServiceTask>): Promise<ServiceTask> => {
    const response = await apiClient.put(`/workorders/tasks/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/tasks/${id}/`);
  },

  start: async (id: number): Promise<ServiceTask> => {
    const response = await apiClient.post(`/workorders/tasks/${id}/start/`);
    return response.data;
  },

  complete: async (id: number, data?: { actual_hours?: number; notes?: string }): Promise<ServiceTask> => {
    const response = await apiClient.post(`/workorders/tasks/${id}/complete/`, data);
    return response.data;
  },
};

