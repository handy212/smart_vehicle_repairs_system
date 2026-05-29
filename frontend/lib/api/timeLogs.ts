import apiClient from "./client";

export interface TimeLog {
  id: number;
  work_order: number;
  work_order_number?: string;
  clock_in: string;
  clock_out?: string | null;
  duration_hours?: number;
  description?: string;
  technician?: number;
}

export const timeLogsApi = {
  getActive: async (): Promise<TimeLog | null> => {
    const response = await apiClient.get<TimeLog | null>("/workorders/time-logs/active/");
    return response.data || null;
  },

  clockIn: async (workOrderId: number, description = "Field work"): Promise<TimeLog> => {
    const response = await apiClient.post<TimeLog>("/workorders/time-logs/clock-in/", {
      work_order: workOrderId,
      description,
    });
    return response.data;
  },

  clockOut: async (timeLogId: number, clockOut?: string): Promise<TimeLog> => {
    const response = await apiClient.post<TimeLog>(
      `/workorders/time-logs/${timeLogId}/clock_out/`,
      { clock_out: clockOut ?? new Date().toISOString() }
    );
    return response.data;
  },
};
