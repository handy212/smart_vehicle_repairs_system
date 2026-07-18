import apiClient from "./client";

export interface TimeLog {
  id: number;
  work_order: number;
  work_order_number?: string;
  task?: number | null;
  task_description?: string | null;
  task_type?: string | null;
  task_type_display?: string | null;
  clock_in: string;
  clock_out?: string | null;
  duration_hours?: number | string | null;
  description?: string;
  technician?: number;
  technician_name?: string;
  is_billable?: boolean;
  is_approved?: boolean;
  labor_cost?: string | number | null;
}

export interface PaginatedTimeLogs {
  count: number;
  next: string | null;
  previous: string | null;
  results: TimeLog[];
}

export const timeLogsApi = {
  list: async (params: {
    work_order?: number;
    technician?: number;
    page?: number;
  }): Promise<PaginatedTimeLogs | TimeLog[]> => {
    const response = await apiClient.get<PaginatedTimeLogs | TimeLog[]>(
      "/workorders/time-logs/",
      { params },
    );
    return response.data;
  },

  getActive: async (): Promise<TimeLog | null> => {
    const response = await apiClient.get<TimeLog | null>("/workorders/time-logs/active/");
    return response.data || null;
  },

  myRecent: async (): Promise<TimeLog[]> => {
    const response = await apiClient.get<TimeLog[]>("/workorders/time-logs/my-recent/");
    return Array.isArray(response.data) ? response.data : [];
  },

  clockIn: async (
    workOrderId: number,
    options: { task: number; description?: string },
  ): Promise<TimeLog> => {
    const response = await apiClient.post<TimeLog>("/workorders/time-logs/clock-in/", {
      work_order: workOrderId,
      task: options.task,
      description: options.description,
    });
    return response.data;
  },

  clockOut: async (timeLogId: number, clockOut?: string): Promise<TimeLog> => {
    const response = await apiClient.post<TimeLog>(
      `/workorders/time-logs/${timeLogId}/clock_out/`,
      { clock_out: clockOut ?? new Date().toISOString() },
    );
    return response.data;
  },
};
